import {
  createContext,
  createEffect,
  createMemo,
  createResource,
  onCleanup,
  useContext,
} from "solid-js";
import html from "solid-js/html";
import { createStore, reconcile } from "solid-js/store";

import { DEFAULT_CLIENT_CONFIG, fetchClientConfig } from "../utils/app-config.js";
import { safeParseJson } from "../utils/parsers.js";

export const Status = {
  LOADING: "LOADING", // Retrieving user data
  LOADED: "LOADED", // Successfully retrieved user data
  SAVING: "SAVING", // Saving user data updates
  ERROR: "ERROR", // Error retrieving user data
};

export const AUTH_STATE_STORAGE_KEY = "auth-state-sync";
export const authSync = {
  reload: () => window.location.reload(),
  handleStorageEvent(event) {
    if (event.key !== AUTH_STATE_STORAGE_KEY || !event.newValue) {
      return false;
    }

    authSync.reload();
    return true;
  },
};

const initialState = () => ({
  isLoggedIn: false,
  status: Status.LOADING,
  user: null,
  expires: null,
});

/**
 * Auth Context
 *
 * NOTE: Do NOT use this context directly. Use the useAuthContext hook instead.
 *       this is exported for testing purposes only.
 *
 * @see useAuthContext - Auth context hook
 */
export const Context = createContext();

/**
 * Auth Context Hook
 *
 * @see AuthProvider - Must be wrapped in a AuthProvider component
 * @returns Auth context
 */
export const useAuthContext = () => {
  const context = useContext(Context);

  if (!context) {
    throw new Error("AuthContext cannot be used outside of the AuthProvider component");
  }

  return context;
};

/**
 * Creates an auth context
 *
 * @see useAuthContext - Auth context hook
 * @param props - Auth context provider props
 * @returns Auth context provider
 */
export const AuthProvider = (props) => {
  const cachedUser = safeParseJson(localStorage.getItem("userDetails"), null);
  const cachedState = cachedUser
    ? {
        isLoggedIn: true,
        status: Status.LOADED,
        user: cachedUser,
      }
    : null;

  const [state, setState] = createStore(cachedState || initialState());
  const [config] = createResource(fetchClientConfig);
  const initialResolvedAuthState = cachedState?.isLoggedIn ?? false;
  let hasResolvedInitialSession = false;
  let lastResolvedAuthState = initialResolvedAuthState;

  const getSessionHeaders = () => {
    const apiKey = new URLSearchParams(location.search).get("apiKey");
    return apiKey ? { "x-api-key": apiKey } : undefined;
  };

  const broadcastAuthState = (isLoggedIn) => {
    localStorage.setItem(AUTH_STATE_STORAGE_KEY, JSON.stringify({ isLoggedIn, at: Date.now() }));
  };

  const fetchSession = async ({ method = "GET", signal } = {}) => {
    try {
      const response = await fetch("/api/v1/session", {
        method,
        headers: getSessionHeaders(),
        signal,
      });

      if (!response.ok) {
        return { error: new Error(`Failed to ${method === "POST" ? "refresh" : "fetch"} session`) };
      }

      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      return { error, data: null };
    }
  };

  const resetState = (status = Status.LOADING) => {
    if (state.isLoggedIn) {
      setState("isLoggedIn", false);
    }
    if (state.status !== status) {
      setState("status", status);
    }
    if (state.user !== null) {
      setState("user", null);
    }
    if (state.expires !== null) {
      setState("expires", null);
    }
  };

  const applySessionData = (data) => {
    if (!data?.user) {
      resetState(Status.LOADED);
      return data;
    }

    if (!state.isLoggedIn) {
      setState("isLoggedIn", true);
    }
    if (state.status !== Status.LOADED) {
      setState("status", Status.LOADED);
    }
    if (state.user === null) {
      setState("user", data.user);
    } else {
      setState("user", reconcile(data.user));
    }
    if (state.expires !== data.expires) {
      setState("expires", data.expires ?? null);
    }

    return data;
  };

  const logout = () => {
    if (!state.isLoggedIn) {
      return;
    }

    broadcastAuthState(false);
    window.location.href = "/api/v1/logout";

    return;
  };

  const setData = (data) => {
    if (!state.isLoggedIn) return;

    setState("user", reconcile({ ...state.user, ...data }));
  };

  const checkSession = async () => {
    const { data, error } = await fetchSession();
    if (error) {
      console.error("Error checking session", error);
      return null;
    }
    return applySessionData(data);
  };

  const refreshSession = async () => {
    const { data, error } = await fetchSession({ method: "POST" });
    if (error) {
      console.error("Error refreshing session", error);
      return null;
    }

    return applySessionData(data);
  };

  const updateExpires = (expires) => {
    if (state.expires !== expires) {
      setState("expires", expires);
    }
  };

  const onStorage = (event) => {
    authSync.handleStorageEvent(event);
  };

  createEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      const { data, error } = await fetchSession({ signal });

      if (signal.aborted) {
        return;
      }

      if (error) {
        resetState(Status.ERROR);
        return;
      }

      applySessionData(data);
    })();

    onCleanup(() => controller.abort());
  });

  createEffect(() => {
    if (state.status !== Status.LOADED) {
      return;
    }

    if (!hasResolvedInitialSession) {
      hasResolvedInitialSession = true;
      if (state.isLoggedIn !== initialResolvedAuthState) {
        broadcastAuthState(state.isLoggedIn);
      }
      lastResolvedAuthState = state.isLoggedIn;
      return;
    }

    if (state.isLoggedIn !== lastResolvedAuthState) {
      broadcastAuthState(state.isLoggedIn);
      lastResolvedAuthState = state.isLoggedIn;
    }
  });

  createEffect(() => {
    if (state.isLoggedIn && typeof state.user === "object") {
      localStorage.setItem("userDetails", JSON.stringify(state.user));
      return;
    }

    localStorage.removeItem("userDetails");
  });
  window.addEventListener("storage", onStorage);
  onCleanup(() => window.removeEventListener("storage", onStorage));

  const value = createMemo(() => ({
    status: () => state.status,
    isLoggedIn: () => state.isLoggedIn,
    user: () => state.user,
    expires: () => state.expires,
    config: () => config() || DEFAULT_CLIENT_CONFIG,
    logout: () => logout(),
    setData: (data) => setData(data),
    checkSession: () => checkSession(),
    refreshSession: () => refreshSession(),
    updateExpires: (expires) => updateExpires(expires),
  }));

  // Expose auth context for integration tests
  window.__authContext = value;

  return html`<${Context.Provider} value=${value()}>${props.children}<//>`;
};

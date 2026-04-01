import {
  batch,
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

export const Status = {
  LOADING: "LOADING", // Retrieving user data
  LOADED: "LOADED", // Successfully retrieved user data
  SAVING: "SAVING", // Saving user data updates
  ERROR: "ERROR", // Error retrieving user data
};

const initialState = () => ({
  isLoggedIn: false,
  status: Status.LOADING,
  user: null,
  access: {},
  expires: null,
  accountDeactivated: false,
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
  const [state, setState] = createStore(initialState());
  const [config] = createResource(fetchClientConfig);

  const getSessionHeaders = () => {
    const apiKey = new URLSearchParams(location.search).get("apiKey");
    return apiKey ? { "x-api-key": apiKey } : undefined;
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

  const resetState = (status = Status.LOADING, access = {}) => {
    batch(() => {
      if (state.isLoggedIn) {
        setState("isLoggedIn", false);
      }
      if (state.user !== null) {
        setState("user", null);
      }
      setState("access", reconcile(access));
      if (state.expires !== null) {
        setState("expires", null);
      }
      if (state.status !== status) {
        setState("status", status);
      }
    });
  };

  const applySessionData = async (data) => {
    const access = data?.access && typeof data.access === "object" ? data.access : {};

    if (!data?.user) {
      resetState(Status.LOADED, access);
      return data;
    }

    if (data.user?.status === "inactive") {
      await fetch("/api/v1/logout", { redirect: "manual" }).catch(() => {});
      batch(() => {
        resetState(Status.LOADED, {});
        setState("accountDeactivated", true);
      });

      return data;
    }

    batch(() => {
      if (!state.isLoggedIn) {
        setState("isLoggedIn", true);
      }
      if (state.user === null) {
        setState("user", data.user);
      } else {
        setState("user", reconcile(data.user));
      }
      setState("access", reconcile(access));
      if (state.expires !== data.expires) {
        setState("expires", data.expires ?? null);
      }
      if (state.status !== Status.LOADED) {
        setState("status", Status.LOADED);
      }
    });

    return data;
  };

  const logout = () => {
    if (!state.isLoggedIn) {
      return;
    }

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

      await applySessionData(data);
    })();

    onCleanup(() => controller.abort());
  });

  const clearDeactivated = () => setState("accountDeactivated", false);

  const value = createMemo(() => ({
    status: () => state.status,
    isLoggedIn: () => state.isLoggedIn,
    user: () => state.user,
    access: () => state.access,
    expires: () => state.expires,
    accountDeactivated: () => state.accountDeactivated,
    config: () => config() || DEFAULT_CLIENT_CONFIG,
    logout: () => logout(),
    setData: (data) => setData(data),
    checkSession: () => checkSession(),
    refreshSession: () => refreshSession(),
    updateExpires: (expires) => updateExpires(expires),
    clearDeactivated: () => clearDeactivated(),
  }));

  // Expose auth context for integration tests
  window.__authContext = value;

  return html`<${Context.Provider} value=${value()}>${props.children}<//>`;
};

import { createContext, createEffect, createMemo, onCleanup, useContext } from "solid-js";
import html from "solid-js/html";

import { createStore } from "solid-js/store";

import { safeParse } from "../utils/utils.js";

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
  const cachedUser = safeParse(localStorage.getItem("userDetails"), null);
  const cachedState = cachedUser
    ? {
        isLoggedIn: true,
        status: Status.LOADED,
        user: cachedUser,
      }
    : null;

  const [state, setState] = createStore(cachedState || initialState());

  const getMyUser = async () => {
    try {
      const response = await fetch("/api/session");

      if (!response.ok) {
        return { error: new Error("Failed to fetch session"), data: null };
      }

      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      return { error, data: null };
    }
  };

  const logout = () => {
    if (!state.isLoggedIn) {
      return;
    }

    window.location.href = "/api/logout";

    return;
  };

  const setData = (data) => {
    if (!state.isLoggedIn) return;

    setState((prev) => ({ ...prev, user: { ...state.user, ...data } }));
  };

  createEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      const { data, error } = await getMyUser();

      if (signal.aborted) {
        return;
      }

      if (error) {
        setState({ ...initialState(), status: Status.ERROR });
        return;
      }
      if (!data?.user) {
        setState({ ...initialState(), status: Status.LOADED });
        return;
      }

      // User has an active session
      setState({
        isLoggedIn: true,
        status: Status.LOADED,
        user: data.user,
      });
    })();

    onCleanup(() => controller.abort());
  });

  createEffect(() => {
    if (state.isLoggedIn && typeof state.user === "object") {
      localStorage.setItem("userDetails", JSON.stringify(state.user));
      return;
    }

    localStorage.removeItem("userDetails");
  });

  const value = createMemo(() => ({
    status: () => state.status,
    isLoggedIn: () => state.isLoggedIn,
    user: () => state.user,
    logout: () => logout(),
    setData: (data) => setData(data),
  }));

  return html`<${Context.Provider} value=${value()}>${props.children}<//>`;
};

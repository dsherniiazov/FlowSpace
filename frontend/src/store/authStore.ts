import { create } from "zustand";
import { persist } from "zustand/middleware";
import { parseJwtIsAdmin, parseJwtSub } from "../lib/auth";
import { setApiAuthToken, setOnUnauthorized } from "../lib/api";

type AuthState = {
  token: string | null;
  userId: number | null;
  email: string | null;
  isAdmin: boolean;
  setSession: (token: string, email: string) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      email: null,
      isAdmin: false,
      setSession: (token: string, email: string) => {
        const userId = parseJwtSub(token);
        setApiAuthToken(token);
        set({
          token,
          userId,
          email,
          isAdmin: parseJwtIsAdmin(token),
        });
      },
      clearSession: () => {
        setApiAuthToken(null);
        set({ token: null, userId: null, email: null, isAdmin: false });
      },
    }),
    {
      name: "flowspace-auth",
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          setApiAuthToken(state.token);
        }
      },
    },
  ),
);

// When any API call returns 401 (expired / revoked token), clear the session
// and send the user to the login screen. This avoids the "site loads blank
// until I relog" state that the token-exists-but-is-rejected case causes.
const LOGIN_PATH = "/auth/login";
setOnUnauthorized(() => {
  const store = useAuthStore.getState();
  if (store.token) {
    store.clearSession();
  }
  if (typeof window !== "undefined") {
    const current = window.location.pathname + window.location.search;
    if (!window.location.pathname.startsWith("/auth/")) {
      // Preserve where the user was so the login page (or its post-login
      // redirect) could return them afterwards if it wants to.
      window.location.replace(`${LOGIN_PATH}?redirect=${encodeURIComponent(current)}`);
    }
  }
});

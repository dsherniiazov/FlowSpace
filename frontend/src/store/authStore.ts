import { create } from "zustand";
import { persist } from "zustand/middleware";
import { parseJwtIsAdmin, parseJwtSub } from "../lib/auth";
import { setApiAuthToken } from "../lib/api";

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

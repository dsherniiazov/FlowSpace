import axios from "axios";
import { API_BASE_URL } from "./env";

export const api = axios.create({
  baseURL: API_BASE_URL,
});

export function setApiAuthToken(token: string | null): void {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

// Callback invoked when any API call fails with HTTP 401. Registered from the
// app bootstrap so we can clear auth state + redirect to login without
// introducing a circular import between `api` and the auth store.
let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 401 && onUnauthorized) {
      try {
        onUnauthorized();
      } catch {
        // Swallow handler errors so the original rejection still propagates.
      }
    }
    return Promise.reject(error);
  },
);

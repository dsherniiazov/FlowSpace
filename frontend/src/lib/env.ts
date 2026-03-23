const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.toString().trim();

function fallbackApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:8000";
  }

  const protocol = window.location.protocol === "https:" ? "https" : "http";
  const host = window.location.hostname || "127.0.0.1";
  return `${protocol}://${host}:8000`;
}

export const API_BASE_URL = envApiBaseUrl || fallbackApiBaseUrl();

export const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS?.toString() || "")
  .split(",")
  .map((value: string) => value.trim().toLowerCase())
  .filter(Boolean);

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.toString().trim() || "http://localhost:8000";

export const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS?.toString() || "")
  .split(",")
  .map((value: string) => value.trim().toLowerCase())
  .filter(Boolean);

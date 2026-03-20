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

import { api } from "../../lib/api";
import { AuthTokenResponse, UserPublic } from "../../types/api";

type LoginPayload = { email: string; password: string };
type RegisterPayload = { email: string; password: string; name: string; last_name: string };

export async function login(payload: LoginPayload): Promise<AuthTokenResponse> {
  const form = new URLSearchParams();
  form.append("username", payload.email);
  form.append("password", payload.password);
  const { data } = await api.post<AuthTokenResponse>("/auth/login", form, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return data;
}

export async function register(payload: RegisterPayload): Promise<UserPublic> {
  const { data } = await api.post<UserPublic>("/auth/register", payload);
  return data;
}

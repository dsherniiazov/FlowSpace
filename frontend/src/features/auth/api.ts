import { api } from "../../lib/api";
import { AuthTokenResponse, OAuthProvidersResponse, UserPublic } from "../../types/api";

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

export async function fetchOAuthProviders(): Promise<OAuthProvidersResponse> {
  const { data } = await api.get<OAuthProvidersResponse>("/auth/oauth/providers");
  return data;
}

export async function forgotPassword(email: string): Promise<void> {
  await api.post("/auth/forgot-password", { email });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await api.post("/auth/reset-password", { token, new_password: newPassword });
}

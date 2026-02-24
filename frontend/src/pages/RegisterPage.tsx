import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AxiosError } from "axios";
import { AuthCard } from "../components/AuthCard";
import { login, register } from "../features/auth/api";
import { API_BASE_URL } from "../lib/env";
import { useAuthStore } from "../store/authStore";

export function RegisterPage(): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);

  async function submit(payload: { email: string; password: string; name?: string; last_name?: string }): Promise<void> {
    try {
      setBusy(true);
      setError(null);
      await register({
        email: payload.email,
        password: payload.password,
        name: payload.name ?? "User",
        last_name: payload.last_name ?? "",
      });
      const token = await login({ email: payload.email, password: payload.password });
      setSession(token.access_token, payload.email);
      navigate("/app");
    } catch (err) {
      const message = err instanceof AxiosError ? err.response?.data?.detail ?? err.message : "Register failed";
      setError(String(message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page min-h-screen px-4 py-10">
      <AuthCard title="Register" submitLabel="Create account" mode="register" busy={busy} error={error} onSubmit={submit} />
      <div className="mx-auto mt-4 max-w-md space-y-2">
        <a className="btn-secondary w-full" href={`${API_BASE_URL}/auth/oauth/google/login?redirect_to=${encodeURIComponent(`${window.location.origin}/auth/oauth/callback`)}`}>Continue with Google</a>
        <a className="btn-secondary w-full" href={`${API_BASE_URL}/auth/oauth/github/login?redirect_to=${encodeURIComponent(`${window.location.origin}/auth/oauth/callback`)}`}>Continue with GitHub</a>
        <p className="text-center text-sm text-zinc-500">Already registered? <Link to="/auth/login" className="auth-inline-link">Login</Link></p>
      </div>
    </div>
  );
}

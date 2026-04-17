import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AxiosError } from "axios";
import { AuthCard } from "../components/AuthCard";
import { fetchOAuthProviders, login } from "../features/auth/api";
import { API_BASE_URL } from "../lib/env";
import { useAuthStore } from "../store/authStore";

export function LoginPage(): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthProviders, setOauthProviders] = useState({ google: false, github: false });
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);

  useEffect(() => {
    let active = true;
    fetchOAuthProviders()
      .then((providers) => {
        if (active) setOauthProviders(providers);
      })
      .catch(() => {
        if (active) setOauthProviders({ google: false, github: false });
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(payload: { email: string; password: string }): Promise<void> {
    try {
      setBusy(true);
      setError(null);
      const token = await login(payload);
      setSession(token.access_token, payload.email);
      navigate("/app");
    } catch (err) {
      const message = err instanceof AxiosError ? err.response?.data?.detail ?? err.message : "Login failed";
      setError(String(message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page page-enter min-h-screen px-4 py-10">
      <AuthCard title="Login" submitLabel="Sign in" mode="login" busy={busy} error={error} onSubmit={submit} />
      <div className="mx-auto mt-4 max-w-md space-y-2">
        {oauthProviders.google ? (
          <a className="btn-secondary w-full" href={`${API_BASE_URL}/auth/oauth/google/login?redirect_to=${encodeURIComponent(`${window.location.origin}/auth/oauth/callback`)}`}>Continue with Google</a>
        ) : null}
        {oauthProviders.github ? (
          <a className="btn-secondary w-full" href={`${API_BASE_URL}/auth/oauth/github/login?redirect_to=${encodeURIComponent(`${window.location.origin}/auth/oauth/callback`)}`}>Continue with GitHub</a>
        ) : null}
        <p className="text-center text-sm text-zinc-500">No account? <Link to="/auth/register" className="auth-inline-link">Register</Link></p>
        <p className="text-center text-sm text-zinc-500"><Link to="/auth/forgot-password" className="auth-inline-link">Forgot password?</Link></p>
      </div>
    </div>
  );
}

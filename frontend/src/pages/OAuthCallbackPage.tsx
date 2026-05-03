import { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "../lib/env";
import { useAuthStore } from "../store/authStore";

export function OAuthCallbackPage(): JSX.Element {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);

  useEffect(() => {
    const token = params.get("access_token");
    const email = params.get("email") ?? "oauth-user@example.com";
    if (token) {
      setSession(token, email);
      navigate("/app", { replace: true });
      return;
    }
    navigate("/auth/login", { replace: true });
  }, [navigate, params, setSession]);

  return <div className="p-8 text-center text-slate-700">Authorizing...</div>;
}

export function OAuthProviderCallbackPage(): JSX.Element {
  const { provider } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!provider) {
      navigate("/auth/login", { replace: true });
      return;
    }
    const query = params.toString();
    const callbackUrl = `${API_BASE_URL}/auth/oauth/${provider}/callback${query ? `?${query}` : ""}`;
    window.location.replace(callbackUrl);
  }, [navigate, params, provider]);

  return <div className="p-8 text-center text-slate-700">Authorizing...</div>;
}

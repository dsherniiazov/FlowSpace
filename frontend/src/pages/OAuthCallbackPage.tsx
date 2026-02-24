import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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

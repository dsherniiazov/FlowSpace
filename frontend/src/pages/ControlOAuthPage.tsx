import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { OAuthSettingsPayload, fetchOAuthSettings, updateOAuthSettings } from "../features/settings/api";

export function ControlOAuthPage(): JSX.Element {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["settings", "oauth"], queryFn: fetchOAuthSettings });
  const [callbackBaseUrl, setCallbackBaseUrl] = useState("");
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [githubClientId, setGithubClientId] = useState("");
  const [githubClientSecret, setGithubClientSecret] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQuery.data) return;
    setCallbackBaseUrl(settingsQuery.data.callback_base_url);
    setGoogleClientId(settingsQuery.data.google.client_id);
    setGithubClientId(settingsQuery.data.github.client_id);
    setGoogleClientSecret("");
    setGithubClientSecret("");
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: OAuthSettingsPayload) => updateOAuthSettings(payload),
    onSuccess: () => {
      setMessage("OAuth settings saved.");
      setError(null);
      setGoogleClientSecret("");
      setGithubClientSecret("");
      void queryClient.invalidateQueries({ queryKey: ["settings", "oauth"] });
      void queryClient.invalidateQueries({ queryKey: ["oauth-providers"] });
    },
    onError: (err) => {
      setMessage(null);
      setError(getErrorMessage(err));
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    saveMutation.mutate({
      callback_base_url: callbackBaseUrl,
      google: {
        client_id: googleClientId,
        client_secret: googleClientSecret || null,
      },
      github: {
        client_id: githubClientId,
        client_secret: githubClientSecret || null,
      },
    });
  }

  return (
    <div className="panel control-panel p-4">
      <h3 className="control-section-heading text-lg font-medium">OAuth</h3>
      <p className="control-copy mt-1 text-sm">
        Configure Google and GitHub login credentials. Use the backend callback URLs configured in each provider console.
      </p>

      {settingsQuery.isLoading ? <div className="mt-4">Loading OAuth settings...</div> : null}
      {settingsQuery.isError ? <div className="mt-4 text-zinc-400">Failed to load OAuth settings.</div> : null}

      <form className="control-settings-form mt-4" onSubmit={onSubmit}>
        <section className="control-settings-section">
          <div>
            <h4 className="control-subheading">Public callback URL</h4>
            <p className="control-copy text-sm">
              Enter the public backend URL used by OAuth providers. Include /api if your backend is proxied under the app domain.
            </p>
          </div>
          <label className="control-field">
            <span>Callback base URL</span>
            <input
              className="input"
              value={callbackBaseUrl}
              onChange={(event) => setCallbackBaseUrl(event.target.value)}
              placeholder="https://your-domain.com/api"
              autoComplete="off"
            />
          </label>
          <div className="control-copy text-sm">
            <div>Google redirect URI: {buildCallbackUrl(callbackBaseUrl, "google")}</div>
            <div>GitHub callback URL: {buildCallbackUrl(callbackBaseUrl, "github")}</div>
          </div>
        </section>

        <section className="control-settings-section">
          <div>
            <h4 className="control-subheading">Google</h4>
            <p className="control-copy text-sm">Callback path: /auth/oauth/google/callback</p>
          </div>
          <label className="control-field">
            <span>Client ID</span>
            <input className="input" value={googleClientId} onChange={(event) => setGoogleClientId(event.target.value)} autoComplete="off" />
          </label>
          <label className="control-field">
            <span>Client secret</span>
            <input
              className="input"
              type="password"
              value={googleClientSecret}
              onChange={(event) => setGoogleClientSecret(event.target.value)}
              placeholder={settingsQuery.data?.google.client_secret_configured ? "Secret configured. Leave blank to keep it." : ""}
              autoComplete="new-password"
            />
          </label>
        </section>

        <section className="control-settings-section">
          <div>
            <h4 className="control-subheading">GitHub</h4>
            <p className="control-copy text-sm">Callback path: /auth/oauth/github/callback</p>
          </div>
          <label className="control-field">
            <span>Client ID</span>
            <input className="input" value={githubClientId} onChange={(event) => setGithubClientId(event.target.value)} autoComplete="off" />
          </label>
          <label className="control-field">
            <span>Client secret</span>
            <input
              className="input"
              type="password"
              value={githubClientSecret}
              onChange={(event) => setGithubClientSecret(event.target.value)}
              placeholder={settingsQuery.data?.github.client_secret_configured ? "Secret configured. Leave blank to keep it." : ""}
              autoComplete="new-password"
            />
          </label>
        </section>

        <button className="btn-primary" type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving..." : "Save OAuth settings"}
        </button>
      </form>

      {message ? <div className="control-status control-status-success mt-4">{message}</div> : null}
      {error ? <div className="control-status control-status-error mt-4">{error}</div> : null}
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { detail?: unknown } } }).response;
    const detail = response?.data?.detail;
    if (typeof detail === "string") return detail;
  }
  return "Request failed.";
}

function buildCallbackUrl(baseUrl: string, provider: "google" | "github"): string {
  const path = `/auth/oauth/${provider}/callback`;
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return path;
  const normalized = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  return `${normalized}${path}`;
}

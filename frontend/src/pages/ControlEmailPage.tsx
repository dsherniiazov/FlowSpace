import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  EmailSettingsPayload,
  fetchEmailSettings,
  sendSmtpTestEmail,
  updateEmailSettings,
} from "../features/settings/api";

export function ControlEmailPage(): JSX.Element {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["settings", "email"], queryFn: fetchEmailSettings });
  const [frontendBaseUrl, setFrontendBaseUrl] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(587);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [useTls, setUseTls] = useState(true);
  const [testRecipient, setTestRecipient] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQuery.data) return;
    setFrontendBaseUrl(settingsQuery.data.frontend_base_url);
    setHost(settingsQuery.data.host);
    setPort(settingsQuery.data.port);
    setUsername(settingsQuery.data.username);
    setFromEmail(settingsQuery.data.from_email);
    setUseTls(settingsQuery.data.use_tls);
    setPassword("");
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: EmailSettingsPayload) => updateEmailSettings(payload),
    onSuccess: () => {
      setMessage("SMTP settings saved.");
      setError(null);
      setPassword("");
      void queryClient.invalidateQueries({ queryKey: ["settings", "email"] });
    },
    onError: (err) => {
      setMessage(null);
      setError(getErrorMessage(err));
    },
  });

  const testMutation = useMutation({
    mutationFn: (recipient: string) => sendSmtpTestEmail(recipient),
    onSuccess: (detail) => {
      setMessage(detail);
      setError(null);
    },
    onError: (err) => {
      setMessage(null);
      setError(getErrorMessage(err));
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    saveMutation.mutate({
      frontend_base_url: frontendBaseUrl,
      host,
      port,
      username,
      password: password || null,
      from_email: fromEmail,
      use_tls: useTls,
    });
  }

  return (
    <div className="panel control-panel p-4">
      <div className="mb-4">
        <h3 className="control-section-heading text-lg font-medium">Email SMTP</h3>
        <p className="control-copy mt-1 text-sm">
          Password reset links use the public frontend URL below. SMTP runs when host, username, and password are set.
          Leave the frontend URL blank to use the server default (<code className="text-zinc-400">FRONTEND_URL</code>
          ).
        </p>
      </div>

      {settingsQuery.isLoading ? <div>Loading email settings...</div> : null}
      {settingsQuery.isError ? <div className="text-zinc-400">Failed to load email settings.</div> : null}

      <form className="control-settings-form" onSubmit={onSubmit}>
        <label className="control-field">
          <span>Public frontend URL</span>
          <input
            className="input"
            type="text"
            value={frontendBaseUrl}
            onChange={(event) => setFrontendBaseUrl(event.target.value)}
            placeholder="https://app.example.com"
            autoComplete="off"
          />
        </label>
        <label className="control-field">
          <span>SMTP host</span>
          <input className="input" value={host} onChange={(event) => setHost(event.target.value)} placeholder="sandbox.smtp.mailtrap.io" />
        </label>
        <label className="control-field">
          <span>Port</span>
          <input className="input" type="number" min={1} max={65535} value={port} onChange={(event) => setPort(Number(event.target.value))} />
        </label>
        <label className="control-field">
          <span>Username</span>
          <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" />
        </label>
        <label className="control-field">
          <span>Password</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={settingsQuery.data?.password_configured ? "Password configured. Leave blank to keep it." : ""}
            autoComplete="new-password"
          />
        </label>
        <label className="control-field">
          <span>From email</span>
          <input className="input" value={fromEmail} onChange={(event) => setFromEmail(event.target.value)} placeholder="noreply@flowspace.local" />
        </label>
        <label className="control-checkbox">
          <input type="checkbox" checked={useTls} onChange={(event) => setUseTls(event.target.checked)} />
          <span>Use STARTTLS</span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save SMTP settings"}
          </button>
        </div>
      </form>

      <div className="control-test-row mt-5">
        <input
          className="input"
          type="email"
          value={testRecipient}
          onChange={(event) => setTestRecipient(event.target.value)}
          placeholder="Test recipient email. Blank sends to you."
        />
        <button
          className="btn-secondary"
          type="button"
          disabled={testMutation.isPending || saveMutation.isPending}
          onClick={() => testMutation.mutate(testRecipient.trim())}
        >
          {testMutation.isPending ? "Sending..." : "Send test email"}
        </button>
      </div>

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

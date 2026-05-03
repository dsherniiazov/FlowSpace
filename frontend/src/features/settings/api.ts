import { api } from "../../lib/api";

export type EmailSettings = {
  frontend_base_url: string;
  host: string;
  port: number;
  username: string;
  password_configured: boolean;
  from_email: string;
  use_tls: boolean;
};

export type EmailSettingsPayload = {
  frontend_base_url: string;
  host: string;
  port: number;
  username: string;
  password?: string | null;
  from_email: string;
  use_tls: boolean;
};

export type OAuthProviderSettings = {
  client_id: string;
  client_secret_configured: boolean;
};

export type OAuthSettings = {
  callback_base_url: string;
  google: OAuthProviderSettings;
  github: OAuthProviderSettings;
};

export type OAuthSettingsPayload = {
  callback_base_url: string;
  google: {
    client_id: string;
    client_secret?: string | null;
  };
  github: {
    client_id: string;
    client_secret?: string | null;
  };
};

export async function fetchEmailSettings(): Promise<EmailSettings> {
  const { data } = await api.get<EmailSettings>("/settings/email");
  return data;
}

export async function updateEmailSettings(payload: EmailSettingsPayload): Promise<EmailSettings> {
  const { data } = await api.put<EmailSettings>("/settings/email", payload);
  return data;
}

export async function sendSmtpTestEmail(toEmail?: string): Promise<string> {
  const { data } = await api.post<{ detail: string }>("/settings/email/test", { to_email: toEmail || null });
  return data.detail;
}

export async function fetchOAuthSettings(): Promise<OAuthSettings> {
  const { data } = await api.get<OAuthSettings>("/settings/oauth");
  return data;
}

export async function updateOAuthSettings(payload: OAuthSettingsPayload): Promise<OAuthSettings> {
  const { data } = await api.put<OAuthSettings>("/settings/oauth", payload);
  return data;
}

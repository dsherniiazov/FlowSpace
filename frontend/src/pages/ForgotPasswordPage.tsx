import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { AxiosError } from "axios";
import { forgotPassword } from "../features/auth/api";

export function ForgotPasswordPage(): JSX.Element {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    try {
      setBusy(true);
      setError(null);
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      const message = err instanceof AxiosError ? err.response?.data?.detail ?? err.message : "Something went wrong";
      setError(String(message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page page-enter min-h-screen px-4 py-10">
      <div className="panel mx-auto w-full max-w-md p-6">
        <h1 className="mb-2 mono text-xl text-zinc-100">Forgot password?</h1>
        <p className="mb-6 text-sm text-zinc-400">
          Enter your account email and we'll send you a password reset link.
        </p>

        {sent ? (
          <div className="rounded border border-zinc-700 bg-zinc-900 p-4 text-sm text-zinc-300">
            If this email is registered, a reset link has been sent. Check your inbox.
          </div>
        ) : (
          <form className="space-y-3" onSubmit={handleSubmit}>
            <input
              className="input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error ? (
              <div className="rounded border border-zinc-800 bg-zinc-950 p-2 text-sm text-zinc-400">{error}</div>
            ) : null}
            <button disabled={busy} className="btn-primary w-full" type="submit">
              {busy ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-zinc-500">
          <Link to="/auth/login" className="auth-inline-link">Back to login</Link>
        </p>
      </div>
    </div>
  );
}

import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AxiosError } from "axios";
import { resetPassword } from "../features/auth/api";

export function ResetPasswordPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    try {
      setBusy(true);
      setError(null);
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate("/auth/login"), 2500);
    } catch (err) {
      const message = err instanceof AxiosError ? err.response?.data?.detail ?? err.message : "Something went wrong";
      setError(String(message));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="auth-page page-enter min-h-screen px-4 py-10">
        <div className="panel mx-auto w-full max-w-md p-6">
          <p className="text-sm text-zinc-400">Invalid or missing password reset link.</p>
          <p className="mt-4 text-center text-sm text-zinc-500">
            <Link to="/auth/login" className="auth-inline-link">Back to login</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page page-enter min-h-screen px-4 py-10">
      <div className="panel mx-auto w-full max-w-md p-6">
        <h1 className="mb-6 mono text-xl text-zinc-100">Set new password</h1>

        {done ? (
          <div className="rounded border border-zinc-700 bg-zinc-900 p-4 text-sm text-zinc-300">
            Password changed successfully. Redirecting to login...
          </div>
        ) : (
          <form className="space-y-3" onSubmit={handleSubmit}>
            <input
              className="input"
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <input
              className="input"
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            {error ? (
              <div className="rounded border border-zinc-800 bg-zinc-950 p-2 text-sm text-zinc-400">{error}</div>
            ) : null}
            <button disabled={busy} className="btn-primary w-full" type="submit">
              {busy ? "Saving..." : "Set password"}
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

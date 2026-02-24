import { FormEvent, useState } from "react";

type Props = {
  title: string;
  submitLabel: string;
  mode: "login" | "register";
  busy: boolean;
  error: string | null;
  onSubmit: (payload: { email: string; password: string; name?: string; last_name?: string }) => Promise<void>;
};

export function AuthCard({ title, submitLabel, mode, busy, error, onSubmit }: Props): JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await onSubmit({ email, password, name, last_name: lastName });
  }

  return (
    <div className="panel mx-auto w-full max-w-md p-6">
      <h1 className="mb-6 mono text-xl text-zinc-100">{title}</h1>
      <form className="space-y-3" onSubmit={handleSubmit}>
        {mode === "register" ? (
          <>
            <input className="input" placeholder="First name" value={name} onChange={(e) => setName(e.target.value)} required />
            <input className="input" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </>
        ) : null}
        <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error ? <div className="rounded border border-zinc-800 bg-zinc-950 p-2 text-sm text-zinc-400">{error}</div> : null}

        <button disabled={busy} className="btn-primary w-full" type="submit">
          {busy ? "Please wait..." : submitLabel}
        </button>
      </form>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EMAIL_RE } from "@/lib/limits";

const input =
  "w-full rounded-xl border border-line bg-paper px-4 py-3.5 outline-none focus:border-ink disabled:opacity-60";

export default function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) return setError("Enter a valid email address.");
    if (!password) return setError("Enter your password.");

    setBusy(true);
    setError(null);
    const { data, error } = await supabaseBrowser().auth.signInWithPassword({ email: clean, password });
    if (error) {
      setBusy(false);
      return setError(
        error.status === 429 ? "Too many attempts. Wait a minute and try again." : "Wrong email or password.",
      );
    }
    router.replace(data.user?.app_metadata?.role === "admin" ? "/admin" : "/home");
    router.refresh();
  }

  return (
    <form onSubmit={signIn} noValidate className="mt-8">
      <div className="space-y-3">
        <input
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="Email"
          aria-label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          className={input}
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          aria-label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          className={input}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-flame-deep">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="mt-5 w-full rounded-full bg-flame py-4 text-lg font-bold text-paper hover:bg-flame-deep disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="mt-8 text-sm text-muted">
        New here? Your account is created with your first profile review.{" "}
        <Link href="/" className="text-ink underline underline-offset-4">
          Get reviewed
        </Link>
      </p>
    </form>
  );
}

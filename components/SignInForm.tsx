"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EMAIL_RE } from "@/lib/limits";

const input =
  "w-full rounded-xl border border-line bg-paper px-4 py-3.5 text-base outline-none focus:border-ink disabled:opacity-60";
const primary =
  "mt-5 w-full rounded-full bg-flame py-4 text-lg font-bold text-paper hover:bg-flame-deep disabled:opacity-60";
const quiet = "text-sm text-muted underline underline-offset-4 hover:text-ink disabled:opacity-60";

/**
 * Email-only sign-in: we email a one-time code (and a link to /auth/confirm).
 * Password sign-in stays available for admins and accounts that set one before.
 */
type Step = "email" | "code" | "password";

/** Must match Supabase: Authentication > Providers > Email > Email OTP Length. */
const OTP_LENGTH = 6;

export default function SignInForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const clean = email.trim().toLowerCase();

  function done(user: User | null) {
    router.replace(user?.app_metadata?.role === "admin" ? "/admin" : "/home");
    router.refresh();
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!EMAIL_RE.test(clean)) return setError("Enter a valid email address.");
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/confirm` },
    });
    setBusy(false);
    if (error) {
      if (error.status === 429) return setError("Too many attempts. Wait a minute and try again.");
      // shouldCreateUser: false → unknown emails are refused. Accounts come with a first review.
      if (error.code === "otp_disabled" || /signups not allowed/i.test(error.message)) {
        return setError("No account with that email. You get one with your first review.");
      }
      return setError("We couldn't send the code. Try again.");
    }
    setCode("");
    setStep("code");
    if (step === "code") setNotice("New code sent.");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length !== OTP_LENGTH) return setError(`Enter the ${OTP_LENGTH}-digit code from the email.`);
    setBusy(true);
    setError(null);
    const { data, error } = await supabaseBrowser().auth.verifyOtp({ email: clean, token, type: "email" });
    if (error) {
      setBusy(false);
      return setError(
        error.status === 429 ? "Too many attempts. Wait a minute and try again." : "That code is wrong or expired.",
      );
    }
    done(data.user);
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
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
    done(data.user);
  }

  const emailField = (
    <input
      type="email"
      inputMode="email"
      autoComplete="email"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      autoFocus
      placeholder="Email"
      aria-label="Email"
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      disabled={busy}
      className={input}
    />
  );

  const alerts = (
    <>
      {error && (
        <p role="alert" className="mt-3 text-sm text-flame-deep">
          {error}
        </p>
      )}
      {notice && !error && <p className="mt-3 text-sm text-muted">{notice}</p>}
    </>
  );

  if (step === "code") {
    return (
      <form onSubmit={verify} noValidate className="mt-8">
        <p className="text-muted">
          We sent a code to <span className="font-semibold text-ink">{clean}</span>. Enter it below.
        </p>
        <p className="mt-3 rounded-xl bg-butter/30 px-4 py-3 text-sm">
          <span className="font-semibold">Not seeing it?</span> Check your spam or junk folder, and mark it
          &ldquo;Not spam&rdquo; so the next one lands in your inbox.
        </p>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={OTP_LENGTH}
          autoFocus
          placeholder="Code"
          aria-label="Code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          disabled={busy}
          className={`${input} mt-5 text-center text-2xl font-bold tracking-[0.4em] tabular-nums`}
        />
        {alerts}
        <button type="submit" disabled={busy} className={primary}>
          {busy ? "Checking…" : "Sign in"}
        </button>
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            className={quiet}
            disabled={busy}
            onClick={() => {
              setStep("email");
              setError(null);
              setNotice(null);
            }}
          >
            Use a different email
          </button>
          <button type="button" className={quiet} disabled={busy} onClick={() => sendCode()}>
            Send a new code
          </button>
        </div>
      </form>
    );
  }

  if (step === "password") {
    return (
      <form onSubmit={signInWithPassword} noValidate className="mt-8">
        <div className="space-y-3">
          {emailField}
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
        {alerts}
        <button type="submit" disabled={busy} className={primary}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <button
          type="button"
          className={`${quiet} mt-6`}
          disabled={busy}
          onClick={() => {
            setStep("email");
            setError(null);
          }}
        >
          Email me a code instead
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} noValidate className="mt-8">
      {emailField}
      {alerts}
      <button type="submit" disabled={busy} className={primary}>
        {busy ? "Sending…" : "Email me a code"}
      </button>
      {/* <button
        type="button"
        className={`${quiet} mt-6`}
        disabled={busy}
        onClick={() => {
          setStep("password");
          setError(null);
        }}
      >
        Use a password instead
      </button> */}
      <p className="mt-8 text-sm text-muted">
        New here? Your account is created with your first review.{" "}
        <Link href="/" className="text-ink underline underline-offset-4">
          Get your score
        </Link>
      </p>
    </form>
  );
}

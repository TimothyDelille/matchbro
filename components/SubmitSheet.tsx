"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readJson, uploadToSignedUrl } from "@/lib/upload";
import { ACCEPTED_TYPES, EMAIL_RE, MAX_FILES, MAX_SUBMISSION_MB } from "@/lib/limits";

type Phase = { kind: "form" } | { kind: "uploading"; progress: number } | { kind: "paying" };

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

type Props = {
  /** Set when the visitor is signed in: no account fields, uses their session. */
  account?: { email: string };
  /** Button text. Defaults to "Review My Profile". */
  label?: string;
};

type ApiResult = {
  error?: string;
  signIn?: boolean;
  submissionId?: string;
  uploads?: { path: string; token: string }[];
  checkoutUrl?: string;
};

export default function SubmitSheet({ account, label = "Review My Profile" }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [full, setFull] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [files, setFiles] = useState<File[]>([]);
  const [email, setEmail] = useState(account?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [dragging, setDragging] = useState(false);
  const busy = phase.kind !== "form";

  useEffect(() => {
    fetch("/api/capacity")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setFull(Boolean(d.full)))
      .catch(() => {});
  }, []);

  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  const tooBig = totalBytes > MAX_SUBMISSION_MB * 1024 * 1024;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = [...list].filter((f) => ACCEPTED_TYPES.includes(f.type));
    if (incoming.length < list.length) setError("Only videos and images work here.");
    else setError(null);
    setFiles((prev) => [...prev, ...incoming].slice(0, MAX_FILES));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNeedsSignIn(false);
    const website = String(new FormData(e.currentTarget).get("website") ?? "");

    if (!files.length) return setError("Add your screenshots first.");
    if (tooBig) return setError(`Keep it under ${MAX_SUBMISSION_MB} MB total.`);
    if (!account) {
      if (!EMAIL_RE.test(email.trim())) return setError("Enter a valid email address.");
    }

    setPhase({ kind: "uploading", progress: 0 });
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(account ? {} : { email }),
          website,
          files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
        }),
      });
      const start = await readJson<ApiResult>(res);
      if (!res.ok) {
        setNeedsSignIn(Boolean(start.signIn));
        throw new Error(start.error);
      }

      const loaded = new Array(files.length).fill(0);
      await Promise.all(
        files.map((file, i) =>
          uploadToSignedUrl(start.uploads![i].path, start.uploads![i].token, file, (n) => {
            loaded[i] = n;
            setPhase({ kind: "uploading", progress: loaded.reduce((a, b) => a + b, 0) / totalBytes });
          }),
        ),
      );

      const done = await fetch(`/api/submissions/${start.submissionId}/complete`, { method: "POST" });
      const result = await readJson<ApiResult>(done);
      if (!done.ok) throw new Error(result.error);
      if (result.checkoutUrl) {
        // Files are uploaded; payment happens on Stripe, then they land on /home.
        setPhase({ kind: "paying" });
        window.location.assign(result.checkoutUrl);
        return;
      }
      // The account is signed in by now (new users are signed in by the API), so go home.
      dialog.current?.close();
      setPhase({ kind: "form" });
      setFiles([]);
      router.push("/home");
      router.refresh();
    } catch (err) {
      setPhase({ kind: "form" });
      setError(err instanceof Error && err.message && err.message !== "network" ? err.message : "Upload failed. Check your connection and try again.");
    }
  }

  function close() {
    if (busy) return;
    dialog.current?.close();
  }

  return (
    <>
      <button
        type="button"
        disabled={full}
        onClick={() => dialog.current?.showModal()}
        className="inline-flex items-center justify-center rounded-full bg-flame px-9 py-5 text-xl font-bold text-paper shadow-[0_10px_0_-2px_var(--flame-deep)] transition active:translate-y-1 active:shadow-[0_6px_0_-2px_var(--flame-deep)] hover:bg-flame-deep disabled:bg-line disabled:text-muted disabled:shadow-none disabled:cursor-not-allowed"
      >
        {full ? "We're full — back soon" : label}
      </button>

      <dialog
        ref={dialog}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
        onClick={(e) => e.target === dialog.current && close()}
        className="m-auto w-[min(100vw-32px,460px)] rounded-3xl bg-paper p-0 text-ink"
      >
        <div className="p-6 sm:p-8 text-left">
            <form onSubmit={submit} noValidate>
              <div className="flex items-start justify-between">
                <h2 className="text-3xl font-extrabold tracking-tight">What&apos;s your score?</h2>
                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  aria-label="Close"
                  className="-mr-2 -mt-1 h-10 w-10 rounded-full text-2xl text-muted hover:bg-line disabled:opacity-30"
                >
                  ×
                </button>
              </div>

              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  addFiles(e.dataTransfer.files);
                }}
                className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
                  dragging ? "border-flame bg-flame/5" : "border-line hover:border-muted"
                }`}
              >
                <input
                  type="file"
                  multiple
                  accept={ACCEPTED_TYPES.join(",")}
                  className="sr-only"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                  disabled={busy}
                />
                <span className="font-bold">Add your screenshots</span>
                <span className="mt-1 text-sm text-muted">Pictures, prompts: include as much as possible</span>
              </label>

              {files.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-xl bg-line/60 px-3 py-2">
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-muted tabular-nums">{mb(f.size)}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${f.name}`}
                        disabled={busy}
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                        className="text-muted hover:text-ink"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                  {tooBig && (
                    <li className="px-1 text-flame-deep">
                      {mb(totalBytes)} total. Keep it under {MAX_SUBMISSION_MB} MB.
                    </li>
                  )}
                </ul>
              )}

              {account ? (
                <p className="mt-5 text-sm text-muted">
                  Signed in as <span className="text-ink font-medium">{account.email}</span>
                </p>
              ) : (
              <div className="mt-5">
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Email"
                  aria-label="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-xl border border-line bg-paper px-4 py-3.5 text-base outline-none focus:border-ink"
                />
                {/* honeypot */}
                <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
              </div>
              )}

              {error && (
                <p role="alert" className="mt-4 text-sm text-flame-deep">
                  {error}
                  {needsSignIn && (
                    <>
                      {" "}
                      <Link href="/signin" className="font-semibold text-ink underline underline-offset-4">
                        Sign in
                      </Link>
                    </>
                  )}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="relative mt-6 w-full overflow-hidden rounded-full bg-flame py-4 text-lg font-bold text-paper hover:bg-flame-deep disabled:hover:bg-flame"
              >
                {phase.kind === "uploading" && (
                  <span
                    className="absolute inset-y-0 left-0 bg-flame-deep transition-[width]"
                    style={{ width: `${Math.round(phase.progress * 100)}%` }}
                  />
                )}
                <span className="relative">
                  {phase.kind === "uploading"
                    ? `Uploading ${Math.round(phase.progress * 100)}%`
                    : phase.kind === "paying"
                      ? "One sec…"
                      : "Get my score"}
                </span>
              </button>
            </form>
        </div>
      </dialog>
    </>
  );
}

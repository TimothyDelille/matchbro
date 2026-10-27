"use client";

import { useEffect, useRef, useState } from "react";
import { ACCEPTED_TYPES, EMAIL_RE, MAX_FILES, MAX_SUBMISSION_MB, normalizePhone } from "@/lib/limits";

type Phase =
  | { kind: "form" }
  | { kind: "uploading"; progress: number }
  | { kind: "done"; position: number };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const BUCKET = "submissions";

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** PUT a file to a Supabase signed upload URL, reporting progress. */
function uploadFile(path: string, token: string, file: File, onProgress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?token=${encodeURIComponent(token)}`;
    xhr.open("PUT", url);
    xhr.setRequestHeader("apikey", SUPABASE_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText)));
    xhr.onerror = () => reject(new Error("network"));
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    xhr.send(form);
  });
}

export default function SubmitSheet() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [full, setFull] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [files, setFiles] = useState<File[]>([]);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

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
    const website = String(new FormData(e.currentTarget).get("website") ?? "");

    if (!files.length) return setError("Add your screen recording first.");
    if (tooBig) return setError(`Keep it under ${MAX_SUBMISSION_MB} MB total. A 60-second recording is plenty.`);
    if (!EMAIL_RE.test(email.trim())) return setError("Enter a valid email address.");
    if (!normalizePhone(phone)) return setError("Enter a valid phone number.");

    setPhase({ kind: "uploading", progress: 0 });
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          phone,
          website,
          files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
        }),
      });
      const start = await res.json();
      if (!res.ok) throw new Error(start.error);

      const loaded = new Array(files.length).fill(0);
      await Promise.all(
        files.map((file, i) =>
          uploadFile(start.uploads[i].path, start.uploads[i].token, file, (n) => {
            loaded[i] = n;
            setPhase({ kind: "uploading", progress: loaded.reduce((a, b) => a + b, 0) / totalBytes });
          }),
        ),
      );

      const done = await fetch(`/api/submissions/${start.submissionId}/complete`, { method: "POST" });
      const result = await done.json();
      if (!done.ok) throw new Error(result.error);
      setPhase({ kind: "done", position: result.position });
    } catch (err) {
      setPhase({ kind: "form" });
      setError(err instanceof Error && err.message && err.message !== "network" ? err.message : "Upload failed. Check your connection and try again.");
    }
  }

  function close() {
    if (phase.kind === "uploading") return;
    dialog.current?.close();
    if (phase.kind === "done") {
      setPhase({ kind: "form" });
      setFiles([]);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={full}
        onClick={() => dialog.current?.showModal()}
        className="inline-flex items-center justify-center rounded-full bg-flame px-9 py-5 text-xl font-bold text-paper shadow-[0_10px_0_-2px_var(--flame-deep)] transition active:translate-y-1 active:shadow-[0_6px_0_-2px_var(--flame-deep)] hover:bg-flame-deep disabled:bg-line disabled:text-muted disabled:shadow-none disabled:cursor-not-allowed"
      >
        {full ? "We're full — back soon" : "Get roasted"}
      </button>

      <dialog
        ref={dialog}
        onCancel={(e) => {
          if (phase.kind === "uploading") e.preventDefault();
        }}
        onClick={(e) => e.target === dialog.current && close()}
        className="m-auto w-[min(100vw-32px,460px)] rounded-3xl bg-paper p-0 text-ink"
      >
        <div className="p-6 sm:p-8 text-left">
          {phase.kind === "done" ? (
            <div className="text-center py-4">
              <div className="text-5xl">🔥</div>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight">You&apos;re #{phase.position} in line.</h2>
              <p className="mt-3 text-muted">
                We&apos;ll email <span className="text-ink font-medium">{email.trim()}</span> when your roast is ready.
              </p>
              <button onClick={close} className="mt-8 w-full rounded-full bg-ink py-4 font-bold text-paper">
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <div className="flex items-start justify-between">
                <h2 className="text-3xl font-extrabold tracking-tight">Send it over</h2>
                <button
                  type="button"
                  onClick={close}
                  disabled={phase.kind === "uploading"}
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
                  disabled={phase.kind === "uploading"}
                />
                <span className="font-bold">Add your screen recording</span>
                <span className="mt-1 text-sm text-muted">Your profile and a few chats, up to {MAX_SUBMISSION_MB} MB</span>
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
                        disabled={phase.kind === "uploading"}
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

              <div className="mt-5 space-y-3">
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="Email"
                  aria-label="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={phase.kind === "uploading"}
                  className="w-full rounded-xl border border-line bg-paper px-4 py-3.5 outline-none focus:border-ink"
                />
                <input
                  type="tel"
                  autoComplete="tel"
                  placeholder="Phone"
                  aria-label="Phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={phase.kind === "uploading"}
                  className="w-full rounded-xl border border-line bg-paper px-4 py-3.5 outline-none focus:border-ink"
                />
                {/* honeypot */}
                <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
              </div>

              {error && (
                <p role="alert" className="mt-4 text-sm text-flame-deep">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={phase.kind === "uploading"}
                className="relative mt-6 w-full overflow-hidden rounded-full bg-flame py-4 text-lg font-bold text-paper hover:bg-flame-deep disabled:hover:bg-flame"
              >
                {phase.kind === "uploading" && (
                  <span
                    className="absolute inset-y-0 left-0 bg-flame-deep transition-[width]"
                    style={{ width: `${Math.round(phase.progress * 100)}%` }}
                  />
                )}
                <span className="relative">
                  {phase.kind === "uploading" ? `Uploading ${Math.round(phase.progress * 100)}%` : "Roast me"}
                </span>
              </button>
              <p className="mt-3 text-center text-xs text-muted">
                This creates your account. Your recording is deleted after we roast it.
              </p>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}

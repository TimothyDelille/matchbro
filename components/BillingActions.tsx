"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readJson } from "@/lib/upload";
import { MAX_REASON_CHARS, MIN_REASON_WORDS, reasonOk, reasonWords } from "@/lib/plans";

async function post(url: string, body?: object) {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await readJson<{ ok?: boolean; checkoutUrl?: string }>(res);
  return { ok: res.ok, data };
}

/** Weekly -> lifetime: opens Stripe Checkout. */
export function UpgradeButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upgrade() {
    setBusy(true);
    setError(null);
    const { ok, data } = await post("/api/billing/upgrade");
    if (ok && data.checkoutUrl) {
      window.location.assign(data.checkoutUrl);
      return;
    }
    setBusy(false);
    setError(data.error ?? "Couldn't open checkout. Try again.");
  }

  return (
    <>
      <button
        type="button"
        onClick={upgrade}
        disabled={busy}
        className="w-full rounded-full bg-flame py-4 text-lg font-bold text-paper shadow-[0_8px_0_-2px_var(--flame-deep)] transition active:translate-y-1 active:shadow-[0_4px_0_-2px_var(--flame-deep)] hover:bg-flame-deep disabled:opacity-80"
      >
        {busy ? "One sec…" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-center text-sm text-flame-deep">
          {error}
        </p>
      )}
    </>
  );
}

/**
 * A textarea that must hold a few words before the destructive button unlocks.
 * Used to cancel a weekly plan and to ask for a lifetime refund.
 */
function ReasonForm({
  label,
  placeholder,
  submitLabel,
  busyLabel,
  note,
  onSubmit,
  onBack,
}: {
  label: string;
  placeholder: string;
  submitLabel: string;
  busyLabel: string;
  /** What happens after they confirm, shown above the buttons. */
  note: string;
  onSubmit: (reason: string) => Promise<string | null>;
  onBack: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const words = reasonWords(reason);
  const ok = reasonOk(reason);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setError(null);
    const err = await onSubmit(reason);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-2xl bg-line/40 p-4 sm:p-5">
      <label htmlFor="billing-reason" className="block font-bold">
        {label}
      </label>
      <textarea
        id="billing-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={MAX_REASON_CHARS}
        required
        disabled={busy}
        className="mt-2 w-full resize-none rounded-xl border-2 border-line bg-paper px-3.5 py-3 text-base outline-none transition focus:border-ink disabled:opacity-60"
      />
      <p className={`mt-1.5 text-xs ${ok ? "text-good" : "text-muted"}`} aria-live="polite">
        {ok ? "Thanks, that helps." : `A few words, please (${Math.min(words, MIN_REASON_WORDS)}/${MIN_REASON_WORDS}).`}
      </p>
      <p className="mt-3 text-sm text-muted">{note}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!ok || busy}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-paper transition hover:bg-bad disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
        >
          {busy ? busyLabel : submitLabel}
        </button>
        <button type="button" onClick={onBack} disabled={busy} className="px-2 py-2.5 text-sm font-semibold text-muted hover:text-ink">
          Never mind
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-flame-deep">
          {error}
        </p>
      )}
    </form>
  );
}

/** "Cancel plan" link that opens the reason form. */
export function CancelPlan({ until }: { until: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-muted underline underline-offset-2 hover:text-ink">
        Cancel plan
      </button>
    );
  }
  return (
    <ReasonForm
      label="Why are you cancelling?"
      placeholder="e.g. I found someone, it's too expensive, the reviews didn't help…"
      submitLabel="Cancel my plan"
      busyLabel="Cancelling…"
      note={`You won't be charged again. Your plan stays active${until ? ` until ${until}` : " until the end of this week"}.`}
      onSubmit={async (reason) => {
        const { ok, data } = await post("/api/billing/cancel", { reason });
        if (!ok) return data.error ?? "Couldn't cancel. Try again.";
        setOpen(false);
        router.refresh();
        return null;
      }}
      onBack={() => setOpen(false)}
    />
  );
}

/** Undo a cancellation before the week ends. */
export function ResumePlan() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resume() {
    setBusy(true);
    setError(null);
    const { ok, data } = await post("/api/billing/resume");
    setBusy(false);
    if (!ok) {
      setError(data.error ?? "Couldn't restart your plan. Try again.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={resume}
        disabled={busy}
        className="rounded-full border-2 border-ink px-5 py-2 text-sm font-bold hover:bg-ink hover:text-paper disabled:opacity-60"
      >
        {busy ? "Restarting…" : "Keep my plan"}
      </button>
      {error && (
        <span role="alert" className="mt-2 text-sm text-flame-deep">
          {error}
        </span>
      )}
    </span>
  );
}

/** Lifetime: ask support for a refund, with a reason. */
export function RefundRequest() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <p role="status" className="text-sm font-medium text-good">
        Request sent. We&apos;ll reply by email.
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-muted underline underline-offset-2 hover:text-ink">
        Request a refund
      </button>
    );
  }
  return (
    <ReasonForm
      label="Why do you want a refund?"
      placeholder="Tell us what went wrong…"
      submitLabel="Send request"
      busyLabel="Sending…"
      note="This goes to our team, who will reply by email. Nothing is charged or refunded until then."
      onSubmit={async (reason) => {
        const { ok, data } = await post("/api/billing/refund-request", { reason });
        if (!ok) return data.error ?? "Couldn't send. Try again.";
        setSent(true);
        return null;
      }}
      onBack={() => setOpen(false)}
    />
  );
}

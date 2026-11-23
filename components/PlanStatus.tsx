"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readJson } from "@/lib/upload";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** The account's plan on /home, with a way to stop a weekly plan from renewing. */
export default function PlanStatus({
  plan,
  periodEnd,
  cancelling,
}: {
  plan: "weekly" | "lifetime";
  /** When the paid week ends (ISO). Weekly only. */
  periodEnd?: string | null;
  /** Weekly only: already set not to renew. */
  cancelling?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const end = periodEnd ? dateFmt.format(new Date(periodEnd)) : null;

  async function cancel() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/billing/cancel", { method: "POST" });
    const data = await readJson<{ ok?: boolean }>(res);
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't cancel. Try again.");
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  return (
    <div className="mt-8 rounded-2xl border border-line px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="font-semibold">
          {plan === "lifetime" ? "Lifetime plan" : "Weekly plan"}
          <span className="ml-2 font-normal text-muted">
            {plan === "lifetime"
              ? "Unlimited reviews"
              : cancelling
                ? `Cancelled${end ? `, active until ${end}` : ""}`
                : end
                  ? `Renews ${end}`
                  : "Active"}
          </span>
        </p>
        {plan === "weekly" && !cancelling && !confirming && (
          <button type="button" onClick={() => setConfirming(true)} className="text-sm text-muted underline underline-offset-2 hover:text-ink">
            Cancel plan
          </button>
        )}
        {confirming && (
          <span className="flex items-center gap-3 text-sm">
            <button type="button" onClick={cancel} disabled={busy} className="font-bold text-flame-deep hover:underline disabled:opacity-60">
              {busy ? "Cancelling…" : "Yes, cancel"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="text-muted hover:text-ink">
              Keep it
            </button>
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-flame-deep">
          {error}
        </p>
      )}
    </div>
  );
}

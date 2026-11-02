"use client";

import { useState } from "react";
import { readJson } from "@/lib/upload";

/** Resumes Stripe Checkout for an uploaded-but-unpaid submission. */
export default function PayButton({ submissionId, priceLabel }: { submissionId: string; priceLabel: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/submissions/${submissionId}/checkout`, { method: "POST" });
    const data = await readJson<{ checkoutUrl?: string }>(res);
    if (res.ok && data.checkoutUrl) {
      window.location.assign(data.checkoutUrl);
      return;
    }
    setBusy(false);
    setError(data.error ?? "Couldn't open checkout. Try again.");
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className="rounded-full bg-flame px-4 py-2 text-sm font-bold text-paper hover:bg-flame-deep disabled:opacity-60"
      >
        {busy ? "Opening…" : priceLabel ? `Pay ${priceLabel}` : "Finish payment"}
      </button>
      {error && <span className="text-xs text-flame-deep">{error}</span>}
    </span>
  );
}

"use client";

import { useState } from "react";
import { readJson } from "@/lib/upload";

/**
 * Sends the owner to Stripe Checkout to unlock a review published before payment.
 * `preview` = an admin looking at someone else's locked view: the button explains
 * instead of starting a checkout (the API only lets the owner unlock).
 */
export default function UnlockButton({
  submissionId,
  priceLabel,
  preview = false,
}: {
  submissionId: string;
  priceLabel: string | null;
  preview?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock() {
    if (preview) {
      setError("Admin preview: only the user who sent this profile can unlock it.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/submissions/${submissionId}/unlock`, { method: "POST" });
    const data = await readJson<{ checkoutUrl?: string }>(res);
    if (res.ok && data.checkoutUrl) {
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
        onClick={unlock}
        disabled={busy}
        className="w-full rounded-full bg-flame px-6 py-4 text-lg font-extrabold text-paper shadow-lg shadow-flame/30 transition hover:bg-flame-deep active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? "Opening checkout…" : `🔒 Unlock the full review${priceLabel ? ` for ${priceLabel}` : ""}`}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-flame-deep">
          {error}
        </p>
      )}
    </>
  );
}

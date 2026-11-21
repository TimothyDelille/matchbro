"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readJson } from "@/lib/upload";

/** Two-step delete: removes the submission, its report and every stored file. */
export default function DeleteSubmissionButton({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/submissions/${submissionId}`, { method: "DELETE" });
    if (res.ok) {
      router.replace("/admin");
      router.refresh();
      return;
    }
    const data = await readJson(res);
    setBusy(false);
    setError(data.error ?? "Couldn't delete the submission. Try again.");
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold text-muted hover:border-flame-deep hover:text-flame-deep"
      >
        Delete
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-3 text-sm">
      <span className="font-semibold">Delete the submission, report and all files for good?</span>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="rounded-full bg-flame-deep px-4 py-1.5 font-bold text-paper hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={busy}
        className="font-semibold text-muted hover:text-ink"
      >
        Cancel
      </button>
      {error && (
        <span role="alert" className="w-full text-flame-deep">
          {error}
        </span>
      )}
    </span>
  );
}

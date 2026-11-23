"use client";

import { useRef } from "react";
import PlanPicker from "@/components/PlanPicker";
import type { Plans } from "@/lib/plans";

/** Resumes payment for an uploaded-but-unpaid submission: opens the plan picker in a sheet. */
export default function PayButton({
  submissionId,
  plans,
  offerEndsAt,
}: {
  submissionId: string;
  plans: Plans;
  /** When the lifetime discount stops for this upload (ISO). */
  offerEndsAt: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="rounded-full bg-flame px-4 py-2 text-sm font-bold text-paper hover:bg-flame-deep"
      >
        Finish payment
      </button>

      <dialog
        ref={dialog}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="m-auto w-[calc(100vw-2rem)] max-w-[420px] rounded-3xl bg-paper p-6 text-ink backdrop:bg-ink/40 sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">Pick your plan</h2>
            <p className="mt-1 text-sm text-muted">Your upload is saved. We start your review as soon as you pay.</p>
          </div>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close"
            className="-mr-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-full text-2xl leading-none text-muted hover:bg-line"
          >
            ×
          </button>
        </div>
        <div className="mt-6">
          <PlanPicker plans={plans} offerEndsAt={offerEndsAt} endpoint={`/api/submissions/${submissionId}/checkout`} />
        </div>
      </dialog>
    </>
  );
}

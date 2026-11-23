import PlanPicker from "@/components/PlanPicker";
import type { Plans } from "@/lib/plans";
import { LOCKED_PREVIEW } from "@/lib/locked-preview";

export default function LockedReport({
  submissionId,
  plans,
  preview = false,
}: {
  submissionId: string;
  /** Null if Stripe isn't reachable: the card then asks them to come back. */
  plans: Plans | null;
  /** An admin previewing the user's locked view. */
  preview?: boolean;
}) {
  return (
    <section className="relative mt-6 -mx-2 overflow-clip px-2" aria-labelledby="unlock-heading">
      <div aria-hidden className="pointer-events-none select-none blur-[7px]">
        <div className="prose prose-lg max-w-none prose-headings:font-extrabold prose-headings:tracking-tight">
          {LOCKED_PREVIEW.map(([heading, body]) => (
            <div key={heading}>
              <h2>{heading}</h2>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-linear-to-b from-paper/0 via-paper/30 to-paper"
      />

      {/*
        The card starts right under the score and is pushed down to the middle of
        the screen when there's room (sticky top = 50% of the viewport minus about
        half the card's height). It stays centred while they scroll the blur.
        The section uses overflow-clip, not overflow-hidden: hidden would make the
        section the sticky scroll container and break the centring.
      */}
      <div className="absolute inset-0 px-2">
        <div className="sticky top-[max(1rem,calc(50svh-14rem))] flex justify-center">
          <div className="w-full max-w-md rounded-3xl border border-line bg-paper p-6 sm:p-7 text-center shadow-2xl shadow-ink/10">
            <h2 id="unlock-heading" className="text-2xl font-extrabold tracking-tight">
              Your full review is ready 🔥
            </h2>
            <p className="mt-2 text-muted">+ a free follow-up if you have a question.</p>

            <div className="mt-5">
              {plans ? (
                <PlanPicker plans={plans} endpoint={`/api/submissions/${submissionId}/unlock`} preview={preview} />
              ) : (
                <p className="text-sm text-muted">Checkout is unavailable right now. Try again in a minute.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

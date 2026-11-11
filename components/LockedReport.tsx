import UnlockButton from "@/components/UnlockButton";

/**
 * Stand-in text for a locked review. The real report never reaches the page
 * while it's locked, so blurring this can't be undone in dev tools.
 */
const PLACEHOLDER = [
  [
    "What's working",
    "Your first photo does a lot of heavy lifting and it shows. There's a real person here, and that's more than most profiles manage. The problem is everything that comes after it, which quietly undoes the good start.",
  ],
  [
    "Photos",
    "Photo two and photo four are telling the same story twice, and neither story is the one you want. Swap one of them for something that shows what a Saturday with you looks like. The group shot needs to go, or at least move way down.",
  ],
  [
    "Prompts",
    "Your prompts are safe in a way that reads as forgettable. Nobody can reply to this answer because there's nothing to grab onto. Here's a rewrite that keeps your voice but gives them an easy opener.",
  ],
  [
    "Conversations",
    "You're asking good questions, then answering them yourself two messages later. Leave room. The second thread died because the follow-up was an interview, not a conversation.",
  ],
  [
    "Try this next",
    "Reorder the photos, rewrite the two weakest prompts, and try the opener below on your next three matches. Then send it back and we'll see what moved.",
  ],
];

export default function LockedReport({
  submissionId,
  priceLabel,
  preview = false,
}: {
  submissionId: string;
  /** "$2.99", or null if Stripe isn't reachable (the button then leaves the price out). */
  priceLabel: string | null;
  /** An admin previewing the user's locked view. */
  preview?: boolean;
}) {
  return (
    <section className="relative mt-6 -mx-2 overflow-clip px-2" aria-labelledby="unlock-heading">
      <div aria-hidden className="pointer-events-none select-none blur-[7px]">
        <div className="prose prose-lg max-w-none prose-headings:font-extrabold prose-headings:tracking-tight">
          {PLACEHOLDER.map(([heading, body]) => (
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
        <div className="sticky top-[max(1rem,calc(50svh-8rem))] flex justify-center">
          <div className="w-full max-w-md rounded-3xl border border-line bg-paper p-6 sm:p-7 text-center shadow-2xl shadow-ink/10">
            <h2 id="unlock-heading" className="text-2xl font-extrabold tracking-tight">
              Your full review is ready 🔥
            </h2>
            <p className="mt-2 text-muted">+ a free follow-up if you have a question.</p>

            <div className="mt-5">
              <UnlockButton submissionId={submissionId} priceLabel={priceLabel} preview={preview} />
            </div>
            <p className="mt-3 text-xs text-muted">One-time payment. Yours to keep.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

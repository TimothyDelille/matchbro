import FollowUpForm from "@/components/FollowUpForm";
import Markdown from "@/components/Markdown";
import type { FollowUp } from "@/lib/follow-up";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" });

/**
 * The free follow-up at the bottom of a review: the ask box, or the question
 * and Tim's answer. `canAsk` is false for admins previewing someone else's review.
 */
export default function FollowUpSection({
  submissionId,
  followUp,
  canAsk,
}: {
  submissionId: string;
  followUp: FollowUp | null;
  canAsk: boolean;
}) {
  if (!followUp && !canAsk) return null;

  return (
    <section id="follow-up" className="mt-14 rounded-3xl border border-line p-5 sm:p-7" aria-labelledby="follow-up-heading">
      <h2 id="follow-up-heading" className="text-2xl font-extrabold tracking-tight">
        {followUp ? "Your follow-up" : "Got a question? Your follow-up is free 🎁"}
      </h2>

      {!followUp ? (
        <>
          <FollowUpForm submissionId={submissionId} />
        </>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="ml-auto max-w-[85%] w-fit rounded-3xl rounded-br-md bg-ink px-5 py-3 text-paper">
            <p className="whitespace-pre-wrap">{followUp.question}</p>
            <p className="mt-1 text-right text-xs text-paper/60">You · {dateFmt.format(new Date(followUp.created_at))}</p>
          </div>

          {followUp.answer ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-muted">
                Tim answered{followUp.answered_at ? ` on ${dateFmt.format(new Date(followUp.answered_at))}` : ""}
              </p>
              <Markdown markdown={followUp.answer} />
            </div>
          ) : (
            <p className="rounded-2xl bg-line/60 px-5 py-4 font-medium">
              Got it. Tim will answer right here soon ⏳
            </p>
          )}
        </div>
      )}
    </section>
  );
}

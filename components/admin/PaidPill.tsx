/**
 * Whether Stripe has a confirmed payment for this submission (submissions.paid_at).
 * "Locked" = review published before payment, waiting for the user to unlock it.
 */
export default function PaidPill({ paidAt, locked = false }: { paidAt: string | null; locked?: boolean }) {
  return paidAt ? (
    <span className="rounded-full border border-ink px-3 py-1 text-sm font-semibold">
      {locked ? "Unlocked" : "Paid"}
    </span>
  ) : locked ? (
    <span className="rounded-full border border-dashed border-muted px-3 py-1 text-sm font-semibold text-muted">
      🔒 Locked
    </span>
  ) : (
    <span className="rounded-full border border-dashed border-muted px-3 py-1 text-sm font-semibold text-muted">
      Unpaid
    </span>
  );
}

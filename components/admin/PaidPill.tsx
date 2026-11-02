/** Whether Stripe has a confirmed payment for this submission (submissions.paid_at). */
export default function PaidPill({ paidAt }: { paidAt: string | null }) {
  return paidAt ? (
    <span className="rounded-full border border-ink px-3 py-1 text-sm font-semibold">Paid</span>
  ) : (
    <span className="rounded-full border border-dashed border-muted px-3 py-1 text-sm font-semibold text-muted">
      Unpaid
    </span>
  );
}

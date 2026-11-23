import Link from "next/link";
import type { Membership } from "@/lib/billing";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** One line on /home: the account's plan, linking to /billing where it's managed. */
export default function PlanStatus({ membership }: { membership: Membership }) {
  const end = membership.plan === "weekly" && membership.periodEnd ? dateFmt.format(new Date(membership.periodEnd)) : null;
  const detail =
    membership.plan === "lifetime"
      ? "Unlimited reviews"
      : membership.cancelling
        ? `Cancelled${end ? `, active until ${end}` : ""}`
        : end
          ? `Renews ${end}`
          : "Active";
  return (
    <Link
      href="/billing"
      className="mt-8 flex items-center justify-between gap-4 rounded-2xl border border-line px-5 py-4 transition hover:border-ink"
    >
      <span>
        <span className="font-semibold">{membership.plan === "lifetime" ? "Lifetime plan" : "Weekly plan"}</span>
        <span className="ml-2 text-muted">{detail}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-flame-deep">Manage →</span>
    </Link>
  );
}

import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import SignOutForm from "@/components/SignOutForm";
import { CancelPlan, RefundRequest, ResumePlan, UpgradeButton } from "@/components/BillingActions";
import { billing, confirmUpgrade, type Billing, type Payment } from "@/lib/billing";
import { planLabels } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabase/server";
import { signInUrl } from "@/lib/next-path";
import type { Plans } from "@/lib/plans";

const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

export default function BillingPage({ searchParams }: PageProps<"/billing">) {
  return (
    <main className="flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-3xl px-5 sm:px-8 pt-6 flex items-center justify-between">
        <Link href="/" className="text-lg font-extrabold tracking-tight">
          matchbro.app 🔥
        </Link>
        <nav className="flex items-center gap-5">
          <Link href="/home" className="text-sm text-muted hover:text-ink">
            Your reviews
          </Link>
          <SignOutForm>
            <button className="text-sm text-muted hover:text-ink">Sign out</button>
          </SignOutForm>
        </nav>
      </header>

      <section className="mx-auto w-full max-w-3xl px-5 sm:px-8 py-14">
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-[-0.04em] leading-none">Billing</h1>
        <Suspense fallback={<BillingSkeleton />}>
          <BillingContent searchParams={searchParams} />
        </Suspense>
      </section>

      <footer className="mt-auto mx-auto w-full max-w-3xl px-5 sm:px-8 pb-8 text-center text-sm text-muted">
        Questions about a charge? Email{" "}
        <a href="mailto:support@matchbro.app" className="font-medium text-ink underline underline-offset-2 hover:text-flame">
          support@matchbro.app
        </a>
      </footer>
    </main>
  );
}

function BillingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading billing" className="animate-pulse">
      <div className="mt-10 h-44 rounded-3xl bg-line" />
      <div className="mt-12 h-6 w-40 rounded-md bg-line" />
      <div className="mt-5 space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="h-12 rounded-xl bg-line" />
        ))}
      </div>
    </div>
  );
}

async function BillingContent({ searchParams }: { searchParams: PageProps<"/billing">["searchParams"] }) {
  // Request time only: reads Stripe and can confirm an upgrade.
  await connection();
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(signInUrl("/billing"));

  // Back from the upgrade checkout: end the weekly plan right away instead of waiting for the webhook.
  const params = await searchParams;
  const sessionId = typeof params.session_id === "string" ? params.session_id : null;
  const upgrade = sessionId ? await confirmUpgrade(sessionId, user.id) : null;

  let data: Billing;
  try {
    data = await billing(user.id);
  } catch (e) {
    console.error("billing page", e);
    return (
      <p role="alert" className="mt-10 rounded-2xl bg-line/60 px-5 py-4 font-medium">
        We couldn&apos;t load your billing right now. Refresh in a minute, or email support@matchbro.app.
      </p>
    );
  }
  const plans = data.membership?.plan === "weekly" ? await planLabels() : null;

  return (
    <>
      {upgrade === "paid" && (
        <p role="status" className="mt-8 rounded-2xl bg-flame/10 px-5 py-4 font-medium">
          You&apos;re on Lifetime now 🔥 Your weekly plan is stopped, so you won&apos;t be charged again.
        </p>
      )}
      {upgrade === "pending" && (
        <p role="status" className="mt-8 rounded-2xl bg-line/60 px-5 py-4 font-medium">
          Your payment is processing. Lifetime starts as soon as it clears.
        </p>
      )}

      <PlanCard billing={data} plans={plans} />
      <History payments={data.history} />
    </>
  );
}

function PlanCard({ billing: { membership: m }, plans }: { billing: Billing; plans: Plans | null }) {
  if (!m) {
    return (
      <div className="mt-10 rounded-3xl border border-line p-6 sm:p-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">Current plan</p>
        <p className="mt-2 text-3xl font-extrabold tracking-tight">No plan</p>
        <p className="mt-2 text-muted">Send your profile to get your score and pick a plan.</p>
        <Link
          href="/home"
          className="mt-5 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-paper hover:bg-flame"
        >
          Get my review
        </Link>
      </div>
    );
  }

  if (m.plan === "lifetime") {
    return (
      <>
        <div className="mt-10 rounded-3xl bg-ink p-6 text-paper sm:p-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-paper/60">Current plan</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight">Lifetime 🔥</p>
          <p className="mt-1 text-paper/80">Unlimited reviews · paid once on {dateFmt.format(new Date(m.since))}</p>
          <p className="mt-4 text-sm text-paper/60">Nothing renews: there are no more charges on this plan.</p>
        </div>
        <div className="mt-4 px-1">
          <RefundRequest />
        </div>
      </>
    );
  }

  const end = m.periodEnd ? dayFmt.format(new Date(m.periodEnd)) : null;
  const sale = plans?.lifetime.sale;
  return (
    <div className="mt-10 rounded-3xl border border-line p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">Current plan</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight">Weekly</p>
          <p className="mt-1 text-muted">
            {plans ? `${plans.weekly.price} / week · ` : ""}
            {m.cancelling ? (
              <span className="font-semibold text-flame-deep">Cancelled{end ? `, active until ${end}` : ""}</span>
            ) : end ? (
              `Renews ${end}`
            ) : (
              "Active"
            )}
          </p>
        </div>
        {m.cancelling && <ResumePlan />}
      </div>

      {plans && (
        <div className="mt-6 rounded-2xl border-2 border-flame bg-flame/5 p-5">
          <p className="text-lg font-extrabold">Switch to Lifetime</p>
          <p className="mt-1 text-sm text-muted">Unlimited reviews. Pay once, no more weekly charges.</p>
          <p className="mt-3 leading-tight">
            {sale && <s className="mr-2 text-muted">{plans.lifetime.price}</s>}
            <span className="text-3xl font-extrabold">{sale?.price ?? plans.lifetime.price}</span>
            <span className="ml-1.5 text-sm text-muted">once</span>
          </p>
          <div className="mt-4">
            <UpgradeButton label={`Upgrade for ${sale?.price ?? plans.lifetime.price}`} />
          </div>
          <p className="mt-3 text-center text-xs text-muted text-pretty">
            Your weekly plan stops as soon as you pay. The current week isn&apos;t refunded.
          </p>
        </div>
      )}

      {!m.cancelling && (
        <div className="mt-6 border-t border-line pt-5">
          <CancelPlan until={end} />
        </div>
      )}
    </div>
  );
}

const STATUS: Record<Payment["status"], { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-good/10 text-good" },
  refunded: { label: "Refunded", className: "bg-line text-muted" },
  partially_refunded: { label: "Part refunded", className: "bg-butter/40 text-ink" },
};

function History({ payments }: { payments: Payment[] }) {
  return (
    <div className="mt-14">
      <h2 className="text-2xl font-extrabold tracking-tight">Payment history</h2>
      {payments.length === 0 ? (
        <p className="mt-4 text-muted">No payments yet.</p>
      ) : (
        <ul className="mt-5 divide-y divide-line border-y border-line">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 py-4">
              <span className="min-w-0">
                <span className="block font-semibold">{p.description}</span>
                <span className="block text-sm text-muted">
                  {p.period ?? dateFmt.format(new Date(p.date))}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS[p.status].className}`}>
                  {STATUS[p.status].label}
                </span>
                <span className={`w-20 text-right font-bold tabular-nums ${p.status === "refunded" ? "text-muted line-through" : ""}`}>
                  {money(p.amount, p.currency)}
                </span>
                {p.receiptUrl ? (
                  <a
                    href={p.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-16 text-right text-sm font-semibold text-flame-deep hover:underline"
                  >
                    Receipt
                  </a>
                ) : (
                  <span className="w-16" />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import "server-only";
import type Stripe from "stripe";
import { scheduleAiReview } from "@/lib/ai-review";
import { sendSupportNote } from "@/lib/email";
import { realEmail } from "@/lib/guest";
import { reasonOk } from "@/lib/plans";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPlanPrice, keyIsLive, lifetimeOfferCoupon, stripe } from "@/lib/stripe";

/**
 * Everything about what an account paid, read from Stripe. Nothing about plans
 * is stored in our database, so refunds and cancellations made in the Stripe
 * Dashboard apply here at once.
 *
 * Where the payments are found:
 *   - Checkout Sessions recorded in `payments` (each one paid for a submission);
 *   - every Checkout Session of the Stripe customers those sessions belong to
 *     (catches the weekly -> lifetime upgrade, which has no submission).
 */

/** A plan the account holds. */
export type Membership =
  | { plan: "lifetime"; since: string }
  | {
      plan: "weekly";
      subscriptionId: string;
      customerId: string;
      /** When the paid week ends (ISO). */
      periodEnd: string | null;
      /** Set not to renew: access ends at periodEnd. */
      cancelling: boolean;
    };

/** One line of the payment history. */
export type Payment = {
  id: string;
  date: string;
  description: string;
  /** The week a weekly payment covers, e.g. "Nov 23 – Nov 30". */
  period: string | null;
  amount: number;
  currency: string;
  status: "paid" | "refunded" | "partially_refunded";
  receiptUrl: string | null;
};

export type Billing = { membership: Membership | null; history: Payment[] };

const EXPAND = ["subscription", "payment_intent.latest_charge"];

/** The account's completed Checkout Sessions, newest first. */
async function paidSessions(userId: string): Promise<Stripe.Checkout.Session[]> {
  const { data, error } = await supabaseAdmin()
    .from("payments")
    .select("stripe_session_id")
    .eq("user_id", userId)
    .in("status", ["paid", "refunded"])
    .eq("livemode", keyIsLive())
    .like("stripe_session_id", "cs\\_%")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const recorded = await Promise.all(
    (data ?? []).map((p) =>
      stripe()
        .checkout.sessions.retrieve(p.stripe_session_id, { expand: EXPAND })
        .catch((e) => {
          console.warn("billing: unreadable checkout session", p.stripe_session_id, (e as Error).message);
          return null;
        }),
    ),
  );

  const byId = new Map<string, Stripe.Checkout.Session>();
  for (const s of recorded) if (s) byId.set(s.id, s);

  // The same Stripe customers' other sessions (the upgrade is only found this way).
  const customers = new Set([...byId.values()].map((s) => (typeof s.customer === "string" ? s.customer : s.customer?.id)).filter(Boolean) as string[]);
  for (const customer of customers) {
    const { data: more } = await stripe().checkout.sessions.list({
      customer,
      status: "complete",
      limit: 50,
      expand: EXPAND.map((e) => `data.${e}`),
    });
    for (const s of more) if (!byId.has(s.id)) byId.set(s.id, s);
  }

  return [...byId.values()]
    .filter((s) => s.payment_status === "paid" && s.metadata?.user_id === userId)
    .sort((a, b) => b.created - a.created);
}

const chargeOf = (s: Stripe.Checkout.Session) => {
  const pi = s.payment_intent;
  if (!pi || typeof pi === "string") return null;
  const c = pi.latest_charge;
  return c && typeof c !== "string" ? c : null;
};

const subscriptionOf = (s: Stripe.Checkout.Session) => (s.subscription && typeof s.subscription !== "string" ? s.subscription : null);

const iso = (unix: number) => new Date(unix * 1000).toISOString();

/** The plan these sessions add up to: a lifetime that wasn't refunded, else an active weekly subscription. */
function membershipFrom(sessions: Stripe.Checkout.Session[]): Membership | null {
  const lifetime = sessions.find((s) => s.metadata?.plan === "lifetime" && !chargeOf(s)?.refunded);
  if (lifetime) return { plan: "lifetime", since: iso(lifetime.created) };

  for (const s of sessions) {
    const sub = subscriptionOf(s);
    if (s.metadata?.plan !== "weekly" || !sub || (sub.status !== "active" && sub.status !== "trialing")) continue;
    const end = sub.items.data[0]?.current_period_end;
    return {
      plan: "weekly",
      subscriptionId: sub.id,
      customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      periodEnd: end ? iso(end) : null,
      cancelling: sub.cancel_at_period_end || sub.cancel_at != null,
    };
  }
  return null;
}

const DESCRIPTIONS: Record<string, string> = { lifetime: "Lifetime plan", weekly: "Weekly plan" };
const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** Every payment: one-time payments from their charge, weekly ones from each paid invoice. */
async function historyFrom(sessions: Stripe.Checkout.Session[]): Promise<Payment[]> {
  const out: Payment[] = [];
  const seenSubs = new Set<string>();
  for (const s of sessions) {
    const sub = subscriptionOf(s);
    if (sub) {
      if (seenSubs.has(sub.id)) continue;
      seenSubs.add(sub.id);
      const invoices = await stripe().invoices.list({ subscription: sub.id, status: "paid", limit: 100 });
      for (const inv of invoices.data) {
        if (!inv.amount_paid) continue;
        const line = inv.lines.data[0]?.period;
        out.push({
          id: inv.id,
          date: iso(inv.status_transitions.paid_at ?? inv.created),
          description: "Weekly plan",
          period: line ? `${dayFmt.format(line.start * 1000)} – ${dayFmt.format(line.end * 1000)}` : null,
          amount: inv.amount_paid,
          currency: inv.currency,
          status: "paid",
          receiptUrl: inv.hosted_invoice_url ?? null,
        });
      }
      continue;
    }
    const charge = chargeOf(s);
    const amount = charge?.amount ?? s.amount_total ?? 0;
    if (!amount) continue;
    out.push({
      id: s.id,
      date: iso(charge?.created ?? s.created),
      description: DESCRIPTIONS[s.metadata?.plan ?? ""] ?? "Profile review",
      period: null,
      amount,
      currency: charge?.currency ?? s.currency ?? "usd",
      status: charge?.refunded ? "refunded" : charge?.amount_refunded ? "partially_refunded" : "paid",
      receiptUrl: charge?.receipt_url ?? null,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Plan + full payment history, for /billing. */
export async function billing(userId: string): Promise<Billing> {
  const sessions = await paidSessions(userId);
  return { membership: membershipFrom(sessions), history: await historyFrom(sessions) };
}

/** Just the plan (paywall, /home, locked reviews). */
export async function membership(userId: string): Promise<Membership | null> {
  return membershipFrom(await paidSessions(userId));
}

/**
 * Record a $0 payment for a submission covered by the account's plan, through
 * the same database path as a Stripe payment. For a fresh upload this queues
 * it (and starts the AI review); for a locked review it unlocks it. Idempotent.
 */
export async function coverWithMembership(sub: { id: string; user_id: string; status: string }) {
  const db = supabaseAdmin();
  const sessionId = `member_${sub.id}`;
  const livemode = keyIsLive();
  const { error: payError } = await db
    .from("payments")
    .upsert(
      { submission_id: sub.id, user_id: sub.user_id, stripe_session_id: sessionId, livemode },
      { onConflict: "stripe_session_id", ignoreDuplicates: true },
    );
  if (payError) throw payError;
  const { error } = await db.rpc("mark_submission_paid", {
    p_session_id: sessionId,
    p_payment_intent: null,
    p_amount: 0,
    p_currency: "usd",
    p_livemode: livemode,
  });
  if (error) throw error;
  if (sub.status === "uploading") scheduleAiReview(sub.id);
}

export class BillingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function emailOf(userId: string) {
  const { data } = await supabaseAdmin().from("profiles").select("email").eq("id", userId).maybeSingle();
  return realEmail(data?.email);
}

/**
 * Stop a weekly plan from renewing. They keep access until the paid week ends.
 * The reason is required: it's saved on the subscription in Stripe and sent to support.
 */
export async function cancelWeekly(userId: string, reason: string): Promise<Membership> {
  if (!reasonOk(reason)) throw new BillingError("Tell us in a few words why you're cancelling.");
  const current = await membership(userId);
  if (current?.plan !== "weekly") throw new BillingError("You don't have a weekly plan to cancel.", 404);
  if (current.cancelling) return current;

  const comment = reason.trim();
  await stripe().subscriptions.update(current.subscriptionId, {
    cancel_at_period_end: true,
    cancellation_details: { comment: comment.slice(0, 5000) },
  });

  const email = await emailOf(userId);
  await sendSupportNote({
    subject: `Weekly plan cancelled: ${email ?? userId}`,
    lines: [
      `Customer: ${email ?? "(no email)"} (user ${userId})`,
      `Subscription: ${current.subscriptionId}`,
      `Access until: ${current.periodEnd ?? "end of the paid week"}`,
      "",
      "Why they cancelled:",
      comment,
    ],
    replyTo: email,
    idempotencyKey: `cancel/${current.subscriptionId}`,
  });
  return { ...current, cancelling: true };
}

/** Undo a cancellation before the week ends: the plan renews again. */
export async function resumeWeekly(userId: string): Promise<Membership> {
  const current = await membership(userId);
  if (current?.plan !== "weekly") throw new BillingError("You don't have a weekly plan.", 404);
  if (!current.cancelling) return current;
  await stripe().subscriptions.update(current.subscriptionId, { cancel_at_period_end: false });
  return { ...current, cancelling: false };
}

/**
 * Checkout for a weekly member moving to lifetime, at the limited-time lifetime
 * price when that coupon exists. Same Stripe customer as the subscription, so
 * the purchase is found again (it has no submission). Once paid, finishUpgrade()
 * ends the weekly plan so it never charges again.
 */
export async function upgradeCheckout(userId: string, origin: string): Promise<string> {
  const current = await membership(userId);
  if (current?.plan === "lifetime") throw new BillingError("You already have the lifetime plan.", 409);
  if (current?.plan !== "weekly") throw new BillingError("Upgrading needs a weekly plan.", 404);

  const [price, coupon] = await Promise.all([getPlanPrice("lifetime"), lifetimeOfferCoupon()]);
  const metadata = { user_id: userId, plan: "lifetime", kind: "upgrade", replaces_subscription: current.subscriptionId };
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer: current.customerId,
    line_items: [{ price: price.id, quantity: 1 }],
    ...(coupon ? { discounts: [{ coupon: coupon.id }] } : {}),
    metadata,
    payment_intent_data: { metadata },
    success_url: `${origin}/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/billing`,
  });
  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return session.url;
}

/**
 * A paid upgrade: end the weekly subscription right away (no more charges;
 * lifetime covers everything). Idempotent, called by the webhook and when they
 * land back on /billing. Returns false for sessions that aren't a paid upgrade.
 */
export async function finishUpgrade(session: Stripe.Checkout.Session): Promise<boolean> {
  if (session.metadata?.kind !== "upgrade" || session.payment_status !== "paid") return false;
  const subId = session.metadata.replaces_subscription;
  if (subId) {
    const sub = await stripe().subscriptions.retrieve(subId);
    if (sub.status !== "canceled" && sub.status !== "incomplete_expired") {
      await stripe().subscriptions.cancel(subId, { cancellation_details: { comment: "Upgraded to lifetime" } });
    }
  }
  return true;
}

/** Back on /billing from the upgrade checkout: confirm it belongs to this user and finish it. */
export async function confirmUpgrade(sessionId: string, userId: string): Promise<"paid" | "pending" | "invalid"> {
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    if (session.metadata?.user_id !== userId || session.metadata?.kind !== "upgrade") return "invalid";
    if (session.payment_status !== "paid") return "pending";
    await finishUpgrade(session);
    return "paid";
  } catch (e) {
    console.error("confirm upgrade", e);
    return "invalid";
  }
}

/**
 * A lifetime customer asking for their money back. Nothing is refunded
 * automatically: support gets the request with the reason and replies by email.
 */
export async function requestRefund(userId: string, reason: string): Promise<void> {
  if (!reasonOk(reason)) throw new BillingError("Tell us in a few words why you want a refund.");
  const { membership: current, history } = await billing(userId);
  if (current?.plan !== "lifetime") throw new BillingError("Refund requests are for the lifetime plan.", 404);
  const paid = history.find((p) => p.description === "Lifetime plan" && p.status === "paid");
  const email = await emailOf(userId);
  await sendSupportNote({
    subject: `Refund request (lifetime): ${email ?? userId}`,
    lines: [
      `Customer: ${email ?? "(no email)"} (user ${userId})`,
      `Lifetime since: ${current.since}`,
      paid ? `Payment: ${paid.id}, ${(paid.amount / 100).toFixed(2)} ${paid.currency.toUpperCase()}` : "Payment: not found",
      "",
      "Why they want a refund:",
      reason.trim(),
    ],
    replyTo: email,
    idempotencyKey: `refund-request/${userId}/${reason.trim().length}/${new Date().toISOString().slice(0, 13)}`,
  });
}

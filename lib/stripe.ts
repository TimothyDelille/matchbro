import "server-only";
import Stripe from "stripe";
import { BUCKET, getSetting, supabaseAdmin } from "@/lib/supabase/admin";
import { isGuestEmail, realEmail } from "@/lib/guest";
import { EMAIL_RE } from "@/lib/limits";
import { scheduleAiReview } from "@/lib/ai-review";
import { offerEndsAt, type PlanId, type Plans } from "@/lib/plans";

/**
 * Stripe is the single source of truth for what the plans cost: a recurring
 * weekly Price (lookup key "weekly") and a one-time Price (lookup key
 * "lifetime"), plus an optional coupon (id "first_week") taken off the first
 * weekly invoice. Nothing in the app or database hardcodes an amount.
 * Sandbox vs live = which keys are set.
 */
const LOOKUP_KEYS: Record<PlanId, string> = {
  weekly: process.env.STRIPE_WEEKLY_LOOKUP_KEY ?? "weekly",
  lifetime: process.env.STRIPE_LIFETIME_LOOKUP_KEY ?? "lifetime",
};
const INTRO_COUPON_ID = process.env.STRIPE_INTRO_COUPON ?? "first_week";
/** Optional coupon for the limited-time lifetime discount (e.g. 30% off, once). No coupon = no offer. */
const LIFETIME_COUPON_ID = process.env.STRIPE_LIFETIME_COUPON ?? "lifetime_offer";

/** Checkout Sessions can't expire sooner than 30 minutes. */
const SESSION_TTL_SECONDS = 30 * 60;

let client: Stripe | null = null;
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
  // A sandbox key on the production site would let people "pay" with test cards.
  if (process.env.VERCEL_ENV === "production" && /^(sk|rk)_test_/.test(key)) {
    throw new Error(
      "STRIPE_SECRET_KEY is a sandbox (test) key on the production deployment. " +
        "Set the live key for the Production environment in Vercel and redeploy.",
    );
  }
  client ??= new Stripe(key);
  return client;
}

/** Is the payment gate on? One switch, shared with the database trigger. */
export async function paymentsRequired(): Promise<boolean> {
  return (await getSetting("payments_required")) === 1;
}

const priceCache = new Map<string, { price: Stripe.Price; at: number }>();

async function getPrice(lookupKey: string): Promise<Stripe.Price> {
  const cached = priceCache.get(lookupKey);
  if (cached && Date.now() - cached.at < 60_000) return cached.price;
  const { data } = await stripe().prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  if (!data.length || data[0].unit_amount == null) {
    throw new Error(`No active Stripe price with lookup key "${lookupKey}"`);
  }
  priceCache.set(lookupKey, { price: data[0], at: Date.now() });
  return data[0];
}

export const getPlanPrice = (plan: PlanId) => getPrice(LOOKUP_KEYS[plan]);

const couponCache = new Map<string, { coupon: Stripe.Coupon | null; at: number }>();

/** A coupon by id, or null if it doesn't exist (or is no longer valid). */
async function getCoupon(id: string): Promise<Stripe.Coupon | null> {
  const cached = couponCache.get(id);
  if (cached && Date.now() - cached.at < 60_000) return cached.coupon;
  let coupon: Stripe.Coupon | null = null;
  try {
    const c = await stripe().coupons.retrieve(id);
    coupon = c.valid ? c : null;
  } catch (e) {
    // Missing coupon = no offer. Any other failure (e.g. a restricted key without
    // "Coupons: read") must not take the paywall down: sell at full price instead.
    if ((e as { code?: string }).code !== "resource_missing") console.error(`coupon ${id}: treating as no coupon`, (e as Error).message);
  }
  couponCache.set(id, { coupon, at: Date.now() });
  return coupon;
}

/** How many cents a coupon takes off an amount. */
const couponOff = (coupon: Stripe.Coupon | null, cents: number) =>
  coupon ? (coupon.amount_off ?? Math.round((cents * (coupon.percent_off ?? 0)) / 100)) : 0;

/** The limited-time lifetime coupon, or null when there's none in Stripe. */
export const lifetimeOfferCoupon = () => getCoupon(LIFETIME_COUPON_ID);

/** Is the lifetime discount still on for an upload started at `startedAt`? A few seconds of grace for slow clicks. */
export function offerActive(startedAt: string): boolean {
  return Date.now() < new Date(offerEndsAt(startedAt)).getTime() + 30_000;
}

const formatAmount = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

/** Shown before the Stripe prices exist (local dev, previews). Never in production. */
const FALLBACK_PLANS: Plans = { weekly: { price: "$7.99", intro: null }, lifetime: { price: "$69.99", sale: null } };

/** Price labels for the paywall, or null if Stripe isn't configured in production. */
export async function planLabels(): Promise<Plans | null> {
  try {
    const [weekly, lifetime, intro, offer] = await Promise.all([
      getPlanPrice("weekly"),
      getPlanPrice("lifetime"),
      getCoupon(INTRO_COUPON_ID),
      getCoupon(LIFETIME_COUPON_ID),
    ]);
    const weeklyCents = weekly.unit_amount!;
    const lifetimeCents = lifetime.unit_amount!;
    const introOff = couponOff(intro, weeklyCents);
    const offerOff = couponOff(offer, lifetimeCents);
    return {
      weekly: {
        price: formatAmount(weeklyCents, weekly.currency),
        intro: introOff > 0 ? formatAmount(Math.max(0, weeklyCents - introOff), weekly.currency) : null,
      },
      lifetime: {
        price: formatAmount(lifetimeCents, lifetime.currency),
        sale:
          offerOff > 0
            ? {
                price: formatAmount(Math.max(0, lifetimeCents - offerOff), lifetime.currency),
                percentOff: Math.round((offerOff / lifetimeCents) * 100),
              }
            : null,
      },
    };
  } catch (e) {
    console.error("plan prices", e);
    return process.env.VERCEL_ENV === "production" ? null : FALLBACK_PLANS;
  }
}

/**
 * The Checkout Session fields that depend on the plan: a one-time payment
 * (with the lifetime coupon while `offer` is on) or a subscription (with the
 * intro coupon, if there is one).
 */
async function planSessionParams(
  plan: PlanId,
  metadata: Record<string, string>,
  offer: boolean,
): Promise<Pick<Stripe.Checkout.SessionCreateParams, "mode" | "line_items" | "discounts" | "payment_intent_data" | "subscription_data">> {
  const price = await getPlanPrice(plan);
  const line_items = [{ price: price.id, quantity: 1 }];
  const coupon = plan === "lifetime" ? (offer ? await getCoupon(LIFETIME_COUPON_ID) : null) : await getCoupon(INTRO_COUPON_ID);
  const discounts = coupon ? { discounts: [{ coupon: coupon.id }] } : {};
  if (plan === "lifetime") return { mode: "payment", line_items, payment_intent_data: { metadata }, ...discounts };
  return { mode: "subscription", line_items, subscription_data: { metadata }, ...discounts };
}

/** Minutes left before reserve_submission expires an unfinished upload (and the sweeper deletes its files). */
export async function uploadMinutesLeft(createdAt: string): Promise<number> {
  const window = await getSetting("upload_window_minutes");
  return window - (Date.now() - new Date(createdAt).getTime()) / 60_000;
}

/** Is STRIPE_SECRET_KEY a live key? Sessions from the other mode can't be read with it. */
export const keyIsLive = () => /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "");

/**
 * This submission's pending Checkout Sessions, newest first, as Stripe sees them now.
 * Skips sessions created in the other mode (e.g. a live session when running
 * locally on a sandbox key) and any Stripe no longer has, instead of failing.
 */
async function pendingSessions(submissionId: string, limit: number): Promise<Stripe.Checkout.Session[]> {
  const { data } = await supabaseAdmin()
    .from("payments")
    .select("stripe_session_id")
    .eq("submission_id", submissionId)
    .eq("status", "pending")
    .eq("livemode", keyIsLive())
    .order("created_at", { ascending: false })
    .limit(limit);
  const sessions: Stripe.Checkout.Session[] = [];
  for (const p of data ?? []) {
    try {
      sessions.push(await stripe().checkout.sessions.retrieve(p.stripe_session_id));
    } catch (e) {
      console.warn("skipping unreadable checkout session", p.stripe_session_id, (e as Error).message);
    }
  }
  return sessions;
}

export class CheckoutError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * Create (or reuse) a Checkout Session for an uploaded, unpaid submission.
 * Caller must already have checked the submission belongs to this user.
 */
export async function checkoutForSubmission(
  sub: { id: string; user_id: string; status: string; created_at: string },
  plan: PlanId,
  origin: string,
): Promise<string> {
  if (sub.status !== "uploading") throw new CheckoutError("This review was already sent or expired.", 409);

  // The session must not outlive the upload window, or the files could be swept mid-payment.
  if ((await uploadMinutesLeft(sub.created_at)) < SESSION_TTL_SECONDS / 60 + 1) {
    throw new CheckoutError("This upload timed out. Send your recording again.", 410);
  }

  const db = supabaseAdmin();
  const offer = offerActive(sub.created_at) ? "1" : "0";

  const { data: files } = await db.storage.from(BUCKET).list(`${sub.user_id}/${sub.id}`, { limit: 1 });
  if (!files?.length) throw new CheckoutError("We couldn't find your upload. Send it again.", 400);

  // Reuse an open session (double clicks, coming back from the Stripe page).
  const [existing] = await pendingSessions(sub.id, 1);
  if (existing) {
    // Only reuse it for the same plan at the same price (they may have picked the other one, or the offer ended).
    if (existing.status === "open" && existing.url && existing.metadata?.plan === plan && existing.metadata?.offer === offer) {
      return existing.url;
    }
    if (existing.payment_status === "paid") {
      await markSessionPaid(existing);
      return `${origin}/reviews/${sub.id}?session_id=${existing.id}`;
    }
  }

  const { data: profile } = await db.from("profiles").select("email").eq("id", sub.user_id).maybeSingle();
  const metadata = { submission_id: sub.id, user_id: sub.user_id, plan, offer };

  const session = await stripe().checkout.sessions.create({
    ...(await planSessionParams(plan, metadata, offer === "1")),
    client_reference_id: sub.id,
    // Guests have no email yet: Checkout asks for it (and we keep it after payment).
    customer_email: realEmail(profile?.email) ?? undefined,
    metadata,
    // Straight to the review page: it shows "analyzing your profile" until the review is published.
    success_url: `${origin}/reviews/${sub.id}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/home?checkout=cancelled`,
    expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });

  const { error } = await db.from("payments").insert({
    submission_id: sub.id,
    user_id: sub.user_id,
    stripe_session_id: session.id,
    livemode: session.livemode,
  });
  if (error) throw error;

  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return session.url;
}

/** A review an admin published before payment, still waiting to be unlocked. */
export const isLocked = (sub: { unlock_required: boolean; paid_at: string | null }) =>
  sub.unlock_required && !sub.paid_at;

/**
 * Create (or reuse) a Checkout Session to unlock a review that was published
 * before payment. Caller must already have checked the submission belongs to this user.
 */
export async function checkoutForUnlock(
  sub: { id: string; user_id: string; status: string; unlock_required: boolean; paid_at: string | null },
  plan: PlanId,
  origin: string,
): Promise<string> {
  if (sub.status !== "done" || !isLocked(sub)) throw new CheckoutError("This review is already unlocked.", 409);

  const db = supabaseAdmin();
  const reviewUrl = `${origin}/reviews/${sub.id}`;

  // Reuse an open unlock session. A pending session for the original upload
  // payment is left alone (it's for a different price).
  for (const existing of await pendingSessions(sub.id, 5)) {
    if (existing.payment_status === "paid") {
      await markSessionPaid(existing);
      return `${reviewUrl}?session_id=${existing.id}`;
    }
    if (
      existing.metadata?.kind === "unlock" &&
      existing.status === "open" &&
      existing.url &&
      existing.metadata?.plan === plan
    ) {
      return existing.url;
    }
  }

  const { data: profile } = await db.from("profiles").select("email").eq("id", sub.user_id).maybeSingle();
  const metadata = { submission_id: sub.id, user_id: sub.user_id, kind: "unlock", plan };

  const session = await stripe().checkout.sessions.create({
    ...(await planSessionParams(plan, metadata, false)),
    client_reference_id: sub.id,
    // Guests have no email yet: Checkout asks for it (and we keep it after payment).
    customer_email: realEmail(profile?.email) ?? undefined,
    metadata,
    success_url: `${reviewUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: reviewUrl,
    expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });

  const { error } = await db.from("payments").insert({
    submission_id: sub.id,
    user_id: sub.user_id,
    stripe_session_id: session.id,
    livemode: session.livemode,
  });
  if (error) throw error;

  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return session.url;
}

/** What happened to the account's email after a payment. */
export type EmailClaim = {
  /** The email the account now uses (null if Stripe gave us none). */
  email: string | null;
  /** The email already had another account: the review was moved there. */
  movedToExistingAccount: boolean;
};

/**
 * Record a paid Checkout Session, queue its submission, and give a guest account
 * the email they typed on Stripe. Idempotent: the webhook and the success page
 * can both call it. Returns null for sessions that aren't paid (yet).
 * Also starts the AI review (lib/ai-review).
 */
export async function markSessionPaid(session: Stripe.Checkout.Session): Promise<EmailClaim | null> {
  const submissionId = session.metadata?.submission_id;
  const userId = session.metadata?.user_id;
  if (!submissionId || !userId || session.payment_status !== "paid") return null;

  const db = supabaseAdmin();
  const { error: upsertError } = await db.from("payments").upsert(
    { submission_id: submissionId, user_id: userId, stripe_session_id: session.id, livemode: session.livemode },
    { onConflict: "stripe_session_id", ignoreDuplicates: true },
  );
  if (upsertError) throw upsertError;

  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
  const { error } = await db.rpc("mark_submission_paid", {
    p_session_id: session.id,
    p_payment_intent: paymentIntent,
    p_amount: session.amount_total,
    p_currency: session.currency,
    p_livemode: session.livemode,
  });
  if (error) throw error;
  
  // Paid and queued: let Claude write the review (no-op if AI reviews are off or it's already taken).
  scheduleAiReview(submissionId);
  return claimPaidEmail(userId, submissionId, session.customer_details?.email);
}

/**
 * After payment, swap a guest account's placeholder for the email typed on Stripe.
 * If that email already has an account, the paid submission moves to it instead
 * (they sign in to see it): typing someone's email on Stripe never signs you
 * into their account. Safe to run more than once.
 */
async function claimPaidEmail(userId: string, submissionId: string, stripeEmail: string | null | undefined): Promise<EmailClaim> {
  const db = supabaseAdmin();
  const { data: profile } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
  const email = stripeEmail?.trim().toLowerCase() ?? "";

  // A real account paying (or no usable email from Stripe): nothing to do.
  if (!profile || !isGuestEmail(profile.email) || !EMAIL_RE.test(email) || isGuestEmail(email)) {
    return { email: realEmail(profile?.email), movedToExistingAccount: false };
  }

  const { data: owner } = await db.from("profiles").select("id").eq("email", email).maybeSingle();

  if (owner && owner.id !== userId) {
    // Every row of this submission that names an owner.
    for (const table of ["payments", "reports", "follow_ups"] as const) {
      const { error } = await db.from(table).update({ user_id: owner.id }).eq("submission_id", submissionId);
      if (error) throw error;
    }
    const { error } = await db.from("submissions").update({ user_id: owner.id }).eq("id", submissionId);
    if (error) throw error;
    return { email, movedToExistingAccount: true };
  }

  if (!owner) {
    // Confirmed straight away: they just proved it on Stripe's receipt, and this sends no email.
    const { error: authError } = await db.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (authError) throw authError;
    const { error } = await db.from("profiles").update({ email }).eq("id", userId);
    if (error) throw error;
  }
  return { email, movedToExistingAccount: false };
}

/** Base URL for Stripe redirects: APP_URL if set, else wherever the request came in. */
export function appOrigin(req: Request): string {
  return (process.env.APP_URL ?? new URL(req.url).origin).replace(/\/+$/, "");
}

/** Plans to show on the paywall, or null when the payment gate is off (or Stripe is unreachable). */
export async function checkoutPlans(): Promise<Plans | null> {
  try {
    return (await paymentsRequired()) ? await planLabels() : null;
  } catch (e) {
    console.error("checkout plans", e);
    return null;
  }
}

export type CheckoutResult =
  | { status: "paid"; claim: EmailClaim | null }
  | { status: "pending" | "invalid" };

/** Success-page check: confirm the session belongs to this user and queue it if paid. */
export async function confirmCheckout(sessionId: string, userId: string): Promise<CheckoutResult> {
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    if (session.metadata?.user_id !== userId) return { status: "invalid" };
    if (session.payment_status !== "paid") return { status: "pending" };
    return { status: "paid", claim: await markSessionPaid(session) };
  } catch (e) {
    console.error("confirm checkout", e);
    return { status: "invalid" };
  }
}

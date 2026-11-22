import "server-only";
import Stripe from "stripe";
import { BUCKET, getSetting, supabaseAdmin } from "@/lib/supabase/admin";
import { isGuestEmail, realEmail } from "@/lib/guest";
import { EMAIL_RE } from "@/lib/limits";
import { scheduleAiReview } from "@/lib/ai-review";

/**
 * Stripe is the single source of truth for what a review costs: a Price with
 * lookup key "roast" (override with STRIPE_PRICE_LOOKUP_KEY). Nothing in the
 * app or database hardcodes an amount. Sandbox vs live = which keys are set.
 */
export const PRICE_LOOKUP_KEY = process.env.STRIPE_PRICE_LOOKUP_KEY ?? "roast";

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

export const getRoastPrice = () => getPrice(PRICE_LOOKUP_KEY);

const formatPrice = (price: Stripe.Price) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: price.currency }).format(price.unit_amount! / 100);

/** "$9.99", or null if Stripe isn't configured (so pages still render). */
export async function roastPriceLabel(): Promise<string | null> {
  try {
    return formatPrice(await getRoastPrice());
  } catch (e) {
    console.error("price", e);
    return null;
  }
}

/** Minutes left before reserve_submission expires an unfinished upload (and the sweeper deletes its files). */
export async function uploadMinutesLeft(createdAt: string): Promise<number> {
  const window = await getSetting("upload_window_minutes");
  return window - (Date.now() - new Date(createdAt).getTime()) / 60_000;
}

/** Is STRIPE_SECRET_KEY a live key? Sessions from the other mode can't be read with it. */
const keyIsLive = () => /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "");

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
  origin: string,
): Promise<string> {
  if (sub.status !== "uploading") throw new CheckoutError("This review was already sent or expired.", 409);

  // The session must not outlive the upload window, or the files could be swept mid-payment.
  if ((await uploadMinutesLeft(sub.created_at)) < SESSION_TTL_SECONDS / 60 + 1) {
    throw new CheckoutError("This upload timed out. Send your recording again.", 410);
  }

  const db = supabaseAdmin();

  const { data: files } = await db.storage.from(BUCKET).list(`${sub.user_id}/${sub.id}`, { limit: 1 });
  if (!files?.length) throw new CheckoutError("We couldn't find your upload. Send it again.", 400);

  // Reuse an open session (double clicks, coming back from the Stripe page).
  const [existing] = await pendingSessions(sub.id, 1);
  if (existing) {
    // Only reuse it if it's still at the current price (prices can change while a session is open).
    if (existing.status === "open" && existing.url && existing.amount_total === (await getRoastPrice()).unit_amount) {
      return existing.url;
    }
    if (existing.payment_status === "paid") {
      await markSessionPaid(existing);
      return `${origin}/reviews/${sub.id}?session_id=${existing.id}`;
    }
  }

  const { data: profile } = await db.from("profiles").select("email").eq("id", sub.user_id).maybeSingle();
  const price = await getRoastPrice();
  const metadata = { submission_id: sub.id, user_id: sub.user_id };

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: sub.id,
    // Guests have no email yet: Checkout asks for it (and we keep it after payment).
    customer_email: realEmail(profile?.email) ?? undefined,
    metadata,
    payment_intent_data: { metadata },
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
      existing.amount_total === (await getRoastPrice()).unit_amount
    ) {
      return existing.url;
    }
  }

  const { data: profile } = await db.from("profiles").select("email").eq("id", sub.user_id).maybeSingle();
  const price = await getRoastPrice();
  const metadata = { submission_id: sub.id, user_id: sub.user_id, kind: "unlock" };

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: sub.id,
    // Guests have no email yet: Checkout asks for it (and we keep it after payment).
    customer_email: realEmail(profile?.email) ?? undefined,
    metadata,
    payment_intent_data: { metadata },
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

/** Price label to show on the submit button, or null when the payment gate is off. */
export async function checkoutPriceLabel(): Promise<string | null> {
  try {
    return (await paymentsRequired()) ? await roastPriceLabel() : null;
  } catch (e) {
    console.error("price label", e);
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

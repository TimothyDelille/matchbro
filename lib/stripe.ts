import "server-only";
import Stripe from "stripe";
import { BUCKET, getSetting, supabaseAdmin } from "@/lib/supabase/admin";

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
  client ??= new Stripe(key);
  return client;
}

/** Is the payment gate on? One switch, shared with the database trigger. */
export async function paymentsRequired(): Promise<boolean> {
  return (await getSetting("payments_required")) === 1;
}

let cachedPrice: { price: Stripe.Price; at: number } | null = null;

export async function getRoastPrice(): Promise<Stripe.Price> {
  if (cachedPrice && Date.now() - cachedPrice.at < 60_000) return cachedPrice.price;
  const { data } = await stripe().prices.list({
    lookup_keys: [PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  });
  if (!data.length || data[0].unit_amount == null) {
    throw new Error(`No active Stripe price with lookup key "${PRICE_LOOKUP_KEY}"`);
  }
  cachedPrice = { price: data[0], at: Date.now() };
  return data[0];
}

/** "$9.99", or null if Stripe isn't configured (so pages still render). */
export async function roastPriceLabel(): Promise<string | null> {
  try {
    const price = await getRoastPrice();
    return new Intl.NumberFormat("en-US", { style: "currency", currency: price.currency }).format(
      price.unit_amount! / 100,
    );
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
  const { data: pending } = await db
    .from("payments")
    .select("stripe_session_id")
    .eq("submission_id", sub.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);
  if (pending?.length) {
    const existing = await stripe().checkout.sessions.retrieve(pending[0].stripe_session_id);
    if (existing.status === "open" && existing.url) return existing.url;
    if (existing.payment_status === "paid") {
      await markSessionPaid(existing);
      return `${origin}/home?session_id=${existing.id}`;
    }
  }

  const { data: profile } = await db.from("profiles").select("email").eq("id", sub.user_id).maybeSingle();
  const price = await getRoastPrice();
  const metadata = { submission_id: sub.id, user_id: sub.user_id };

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: sub.id,
    customer_email: profile?.email ?? undefined,
    metadata,
    payment_intent_data: { metadata },
    success_url: `${origin}/home?session_id={CHECKOUT_SESSION_ID}`,
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

/**
 * Record a paid Checkout Session and queue its submission. Idempotent: the
 * webhook and the success page can both call it.
 */
export async function markSessionPaid(session: Stripe.Checkout.Session): Promise<string | null> {
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
  const { data, error } = await db.rpc("mark_submission_paid", {
    p_session_id: session.id,
    p_payment_intent: paymentIntent,
    p_amount: session.amount_total,
    p_currency: session.currency,
    p_livemode: session.livemode,
  });
  if (error) throw error;
  return data as string;
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

/** Success-page check: confirm the session belongs to this user and queue it if paid. */
export async function confirmCheckout(sessionId: string, userId: string): Promise<"paid" | "pending" | "invalid"> {
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    if (session.metadata?.user_id !== userId) return "invalid";
    if (session.payment_status !== "paid") return "pending";
    await markSessionPaid(session);
    return "paid";
  } catch (e) {
    console.error("confirm checkout", e);
    return "invalid";
  }
}

import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// ---- Config (all from Supabase Edge Function secrets) ----------------------
// STRIPE_SECRET_KEY        sk_test_… in sandbox, sk_live_… in production
// STRIPE_WEBHOOK_SECRET    whsec_… for the stripe-webhook endpoint
// APP_URL                  e.g. https://hingeroast.com (no trailing slash)
// STRIPE_PRICE_LOOKUP_KEY  optional, defaults to "roast"
//
// The price itself lives ONLY in Stripe. Swapping sandbox <-> live is just
// swapping the two Stripe secrets; both accounts have a Price with the same
// lookup_key, so no code or DB changes.

export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  httpClient: Stripe.createFetchHttpClient(),
});

export const cryptoProvider = Stripe.createSubtleCryptoProvider();

export const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const PRICE_LOOKUP_KEY = Deno.env.get("STRIPE_PRICE_LOOKUP_KEY") ?? "roast";
export const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");

let cachedPrice: { price: Stripe.Price; at: number } | null = null;

/** The single source of truth for what a roast costs. */
export async function getRoastPrice(): Promise<Stripe.Price> {
  if (cachedPrice && Date.now() - cachedPrice.at < 60_000) return cachedPrice.price;
  const { data } = await stripe.prices.list({
    lookup_keys: [PRICE_LOOKUP_KEY],
    active: true,
    expand: ["data.product"],
    limit: 1,
  });
  if (!data.length) {
    throw new Error(`No active Stripe price with lookup_key "${PRICE_LOOKUP_KEY}"`);
  }
  cachedPrice = { price: data[0], at: Date.now() };
  return data[0];
}

/**
 * Record a paid Checkout Session and queue its submission. Idempotent, used by
 * both the webhook and the success-page verify call.
 */
export async function markSessionPaid(s: Stripe.Checkout.Session): Promise<string | null> {
  const submissionId = s.metadata?.submission_id;
  const userId = s.metadata?.user_id;
  if (!submissionId || !userId) return null; // not one of ours

  // Make sure a payments row exists even if checkout insert somehow failed.
  const { error: upsertErr } = await admin.from("payments").upsert(
    { submission_id: submissionId, user_id: userId, stripe_session_id: s.id, livemode: s.livemode },
    { onConflict: "stripe_session_id", ignoreDuplicates: true },
  );
  if (upsertErr) throw upsertErr;

  const paymentIntent = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
  const { data, error } = await admin.rpc("mark_submission_paid", {
    p_session_id: s.id,
    p_payment_intent: paymentIntent,
    p_amount: s.amount_total,
    p_currency: s.currency,
    p_livemode: s.livemode,
  });
  if (error) throw error;
  return data as string;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

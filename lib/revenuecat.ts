import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { scheduleAiReview } from "@/lib/ai-review";

/**
 * In-app purchases from the iOS app, through RevenueCat.
 *
 * The app logs in to RevenueCat with the Supabase user id, buys the consumable
 * "review" product, then calls POST /api/submissions/:id/purchase with the App
 * Store transaction id. We check that transaction with RevenueCat and record it
 * in the same `payments` table as Stripe (stripe_session_id = "rc_<transaction id>"),
 * so the gate trigger, paid_at and mark_submission_paid() work unchanged.
 */
export class PurchaseError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

type NonSubscription = { id: string; store_transaction_id: string; is_sandbox: boolean };

/** The purchase as RevenueCat sees it on this user, or null if it isn't theirs. */
async function findPurchase(userId: string, transactionId: string): Promise<NonSubscription | null> {
  const key = process.env.REVENUECAT_SECRET_KEY;
  if (!key) throw new Error("REVENUECAT_SECRET_KEY is missing");
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RevenueCat ${res.status}: ${await res.text()}`);
  const { subscriber } = (await res.json()) as {
    subscriber?: { non_subscriptions?: Record<string, NonSubscription[]> };
  };
  const all = Object.values(subscriber?.non_subscriptions ?? {}).flat();
  return all.find((p) => p.store_transaction_id === transactionId || p.id === transactionId) ?? null;
}

/**
 * Pay for an uploaded submission, or unlock a review published before payment.
 * Idempotent: retrying with the same transaction is fine; one transaction pays one submission.
 */
export async function recordPurchase(sub: { id: string; user_id: string }, transactionId: string) {
  const db = supabaseAdmin();
  const sessionId = `rc_${transactionId}`;

  const { data: used } = await db.from("payments").select("submission_id").eq("stripe_session_id", sessionId).maybeSingle();
  if (used && used.submission_id !== sub.id) throw new PurchaseError("This purchase was already used.", 409);

  const purchase = await findPurchase(sub.user_id, transactionId);
  if (!purchase) throw new PurchaseError("We couldn't verify your purchase. Try again in a minute.", 402);

  const { error: upsertError } = await db.from("payments").upsert(
    { submission_id: sub.id, user_id: sub.user_id, stripe_session_id: sessionId, livemode: !purchase.is_sandbox },
    { onConflict: "stripe_session_id", ignoreDuplicates: true },
  );
  if (upsertError) throw upsertError;

  // Amount isn't in RevenueCat's v1 purchase record; the App Store has it.
  const { data: status, error } = await db.rpc("mark_submission_paid", {
    p_session_id: sessionId,
    p_payment_intent: null,
    p_amount: null,
    p_currency: null,
    p_livemode: !purchase.is_sandbox,
  });
  if (error) throw error;

  scheduleAiReview(sub.id);
  return status as string;
}

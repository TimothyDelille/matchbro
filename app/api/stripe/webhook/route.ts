import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { markSessionPaid, stripe } from "@/lib/stripe";
import { finishUpgrade } from "@/lib/billing";

// Room for the AI review that starts after a payment (lib/ai-review).
export const maxDuration = 300;

/**
 * Stripe webhook. Events to send here:
 *   checkout.session.completed, checkout.session.async_payment_succeeded,
 *   checkout.session.expired, charge.refunded
 * Local: stripe listen --forward-to localhost:3000/api/stripe/webhook
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is missing");
    return new Response("not configured", { status: 500 });
  }

  const payload = await req.text(); // raw body: signature is computed over it
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(payload, req.headers.get("stripe-signature") ?? "", secret);
  } catch (e) {
    console.warn("stripe webhook signature", (e as Error).message);
    return new Response("invalid signature", { status: 400 });
  }

  try {
    const db = supabaseAdmin();
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        // Delayed payment methods complete unpaid; markSessionPaid ignores those
        // until async_payment_succeeded arrives.
        // A weekly member buying lifetime (no submission): end the weekly plan.
        if (event.data.object.metadata?.kind === "upgrade") await finishUpgrade(event.data.object);
        else await markSessionPaid(event.data.object);
        break;

      case "checkout.session.expired": {
        const { error } = await db
          .from("payments")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("stripe_session_id", event.data.object.id)
          .eq("status", "pending");
        if (error) throw error;
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (pi && charge.refunded) {
          const { error } = await db
            .from("payments")
            .update({ status: "refunded", updated_at: new Date().toISOString() })
            .eq("stripe_payment_intent_id", pi);
          if (error) throw error;
        }
        break;
      }
    }
  } catch (e) {
    // 500 makes Stripe retry; every handler is idempotent.
    console.error(`stripe webhook ${event.type} ${event.id}`, e);
    return new Response("handler error", { status: 500 });
  }

  return Response.json({ received: true });
}

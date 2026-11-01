// stripe-webhook
// Stripe -> https://<project>.supabase.co/functions/v1/stripe-webhook
// Deployed with verify_jwt = false; authenticity comes from the Stripe signature.
//
// Events to enable on the endpoint:
//   checkout.session.completed
//   checkout.session.async_payment_succeeded
//   checkout.session.expired
//   charge.refunded
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type Stripe from "npm:stripe@17.7.0";
import { admin, cryptoProvider, markSessionPaid, stripe } from "../_shared/stripe.ts";

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const signature = req.headers.get("stripe-signature");
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature ?? "",
      WEBHOOK_SECRET,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.warn("Bad Stripe signature:", (err as Error).message);
    return new Response("invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        // For delayed methods, "completed" arrives unpaid; wait for async_payment_succeeded.
        if (session.payment_status === "paid") {
          const status = await markSessionPaid(session);
          console.log(`session ${session.id} paid -> submission ${status ?? "(not ours)"}`);
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { error } = await admin
          .from("payments")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("stripe_session_id", session.id)
          .eq("status", "pending");
        if (error) throw error;
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (pi && charge.refunded) { // full refunds only
          const { error } = await admin
            .from("payments")
            .update({ status: "refunded", updated_at: new Date().toISOString() })
            .eq("stripe_payment_intent_id", pi);
          if (error) throw error;
        }
        break;
      }

      default:
        // Ignore everything else, but acknowledge so Stripe doesn't retry.
        break;
    }
  } catch (err) {
    // 500 -> Stripe retries with backoff; handlers are idempotent.
    console.error(`Failed handling ${event.type} ${event.id}`, err);
    return new Response("handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

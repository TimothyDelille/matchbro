// roast-checkout
//   GET                                   -> current roast price (public)
//   POST { submission_id, success_path?, cancel_path? }
//                                         -> { url } Stripe Checkout URL (auth)
//   POST { action: "verify", session_id } -> { paid, status } (auth)
//
// Deployed with verify_jwt = false so GET can be public; POST checks the
// user's Supabase JWT itself.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type Stripe from "npm:stripe@17.7.0";
import {
  admin,
  APP_URL,
  corsHeaders,
  getRoastPrice,
  HttpError,
  json,
  markSessionPaid,
  stripe,
} from "../_shared/stripe.ts";

const SESSION_TTL_SECONDS = 30 * 60; // Stripe minimum

async function requireUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "unauthorized");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "unauthorized");
  return data.user;
}

function safePath(p: unknown, fallback: string): string {
  // Only same-site relative paths, so this can't become an open redirect.
  return typeof p === "string" && p.startsWith("/") && !p.startsWith("//") ? p : fallback;
}

function withParam(path: string, param: string): string {
  return path + (path.includes("?") ? "&" : "?") + param;
}

async function createCheckout(
  user: { id: string; email?: string },
  body: { submission_id?: string; success_path?: unknown; cancel_path?: unknown },
) {
  const submissionId = body.submission_id;
  if (!submissionId) throw new HttpError(400, "submission_id_required");
  if (!APP_URL) throw new Error("APP_URL secret is not set");

  const { data: sub, error } = await admin
    .from("submissions")
    .select("id, user_id, status")
    .eq("id", submissionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!sub) throw new HttpError(404, "submission_not_found");
  if (sub.status === "expired") throw new HttpError(410, "upload_window_expired");
  if (sub.status !== "uploading") throw new HttpError(409, "already_submitted");

  // Must have at least one uploaded file.
  const { data: files, error: listErr } = await admin.storage
    .from("submissions")
    .list(`${user.id}/${sub.id}`, { limit: 1 });
  if (listErr) throw listErr;
  if (!files?.length) throw new HttpError(400, "no_files_uploaded");

  // Reuse an open session instead of creating duplicates (double clicks, back button).
  const { data: pending } = await admin
    .from("payments")
    .select("stripe_session_id")
    .eq("submission_id", sub.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);
  if (pending?.length) {
    const existing = await stripe.checkout.sessions.retrieve(pending[0].stripe_session_id);
    if (existing.status === "open" && existing.url) return { url: existing.url };
    if (existing.payment_status === "paid") {
      return { already_paid: true, status: await markSessionPaid(existing) };
    }
  }

  const price = await getRoastPrice();
  const successPath = safePath(body.success_path, "/");
  const cancelPath = safePath(body.cancel_path, "/");
  const metadata = { submission_id: sub.id, user_id: user.id };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: sub.id,
    customer_email: user.email,
    metadata,
    payment_intent_data: { metadata },
    success_url: APP_URL + withParam(successPath, "session_id={CHECKOUT_SESSION_ID}"),
    cancel_url: APP_URL + withParam(cancelPath, "checkout=cancelled"),
    expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });

  const { error: insErr } = await admin.from("payments").insert({
    submission_id: sub.id,
    user_id: user.id,
    stripe_session_id: session.id,
    livemode: session.livemode,
  });
  if (insErr) throw insErr;

  return { url: session.url };
}

async function verify(user: { id: string }, sessionId?: string) {
  if (!sessionId) throw new HttpError(400, "session_id_required");
  const { data: row } = await admin
    .from("payments")
    .select("stripe_session_id")
    .eq("stripe_session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row) throw new HttpError(404, "session_not_found");

  const session: Stripe.Checkout.Session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") {
    return { paid: false, checkout_status: session.status };
  }
  return { paid: true, status: await markSessionPaid(session) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method === "GET") {
      const price = await getRoastPrice();
      const product = price.product as Stripe.Product;
      return json({
        amount: price.unit_amount, // minor units, e.g. 999 = $9.99
        currency: price.currency,
        product_name: product?.name ?? null,
        livemode: price.livemode,
      });
    }

    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));

    if (body.action === "verify") return json(await verify(user, body.session_id));
    return json(await createCheckout(user, body));
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "internal_error" }, 500);
  }
});

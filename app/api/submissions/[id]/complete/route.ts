import { BUCKET, configError, getSetting, supabaseAdmin } from "@/lib/supabase/admin";
import { appOrigin, checkoutForSubmission, CheckoutError, paymentsRequired, roastPriceLabel } from "@/lib/stripe";
import { DEMO_MARKDOWN, DEMO_SCORES, isDemoUser } from "@/lib/demo";
import { saveReport } from "@/lib/report";
import { currentUser } from "@/lib/supabase/server";

/**
 * Step 2: after the browser uploads, verify the files. Then either hand back a
 * Stripe Checkout URL (payments on) or queue it straight away (payments off).
 * The submission only reaches "queued" once Stripe says it's paid.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/submissions/[id]/complete">) {
  const misconfigured = configError();
  if (misconfigured) return Response.json({ error: misconfigured }, { status: 500 });
  const { id } = await ctx.params;
  const db = supabaseAdmin();

  const { data: sub } = await db
    .from("submissions")
    .select("id, user_id, status, file_paths, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!sub) return Response.json({ error: "Submission not found." }, { status: 404 });
  if (sub.status !== "uploading") {
    return Response.json({ error: "This upload already finished or expired." }, { status: 409 });
  }

  // Check what actually landed in storage.
  const { data: objects, error } = await db.storage
    .from(BUCKET)
    .list(`${sub.user_id}/${sub.id}`, { limit: 100 });
  if (error) return Response.json({ error: "Could not verify upload." }, { status: 500 });

  const uploaded = new Map((objects ?? []).map((o) => [`${sub.user_id}/${sub.id}/${o.name}`, Number(o.metadata?.size ?? 0)]));
  const missing = sub.file_paths.filter((p: string) => !uploaded.has(p));
  const totalBytes = [...uploaded.values()].reduce((a, b) => a + b, 0);
  const maxBytes = await getSetting("max_submission_bytes");

  if (missing.length || totalBytes > maxBytes) {
    if (uploaded.size) await db.storage.from(BUCKET).remove([...uploaded.keys()]);
    await db.from("submissions").update({ status: "expired", file_paths: [], total_bytes: 0 }).eq("id", sub.id);
    return Response.json(
      { error: missing.length ? "Some files didn't upload. Try again." : "Upload is too large." },
      { status: 400 },
    );
  }

  // Demo account: no Stripe, and the canned review is published right away.
  const user = await currentUser();
  if (isDemoUser(user) && user!.id === sub.user_id) {
    try {
      await db.from("submissions").update({ total_bytes: totalBytes }).eq("id", sub.id);
      if (await paymentsRequired()) {
        // Same path as a Stripe payment, recorded as a $0 test-mode "comp_" payment.
        const sessionId = `comp_${sub.id}`;
        const { error: payError } = await db
          .from("payments")
          .upsert(
            { submission_id: sub.id, user_id: sub.user_id, stripe_session_id: sessionId, livemode: false },
            { onConflict: "stripe_session_id", ignoreDuplicates: true },
          );
        if (payError) throw payError;
        const { error: paidError } = await db.rpc("mark_submission_paid", {
          p_session_id: sessionId,
          p_payment_intent: null,
          p_amount: 0,
          p_currency: "usd",
          p_livemode: false,
        });
        if (paidError) throw paidError;
      } else {
        await db.from("submissions").update({ status: "queued", submitted_at: new Date().toISOString() }).eq("id", sub.id);
      }
      await saveReport(sub.id, { markdown: DEMO_MARKDOWN, audioPath: null, scores: DEMO_SCORES, publish: true });
      return Response.json({ reviewUrl: `/reviews/${sub.id}` });
    } catch (e) {
      console.error("demo review", e);
      return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }
  }

  if (await paymentsRequired()) {
    await db.from("submissions").update({ total_bytes: totalBytes }).eq("id", sub.id);
    try {
      const checkoutUrl = await checkoutForSubmission(sub, appOrigin(req));
      // The price is shown on the paywall step before they leave for Stripe.
      return Response.json({ checkoutUrl, priceLabel: await roastPriceLabel() });
    } catch (e) {
      if (e instanceof CheckoutError) return Response.json({ error: e.message }, { status: e.status });
      console.error("checkout", e);
      return Response.json({ error: "We couldn't start checkout. Try again." }, { status: 500 });
    }
  }

  await db
    .from("submissions")
    .update({ status: "queued", submitted_at: new Date().toISOString(), total_bytes: totalBytes })
    .eq("id", sub.id);

  return Response.json({ ok: true });
}

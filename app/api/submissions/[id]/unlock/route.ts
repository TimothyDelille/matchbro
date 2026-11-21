import { configError, supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { appOrigin, checkoutForUnlock, CheckoutError } from "@/lib/stripe";

// Room for the AI review that can start when a payment is confirmed here (lib/ai-review).
export const maxDuration = 300;

/** Start Stripe Checkout to unlock a review that was published before payment (signed-in owner only). */
export async function POST(req: Request, ctx: RouteContext<"/api/submissions/[id]/unlock">) {
  const misconfigured = configError();
  if (misconfigured) return Response.json({ error: misconfigured }, { status: 500 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const { id } = await ctx.params;
  const { data: sub } = await supabaseAdmin()
    .from("submissions")
    .select("id, user_id, status, unlock_required, paid_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!sub) return Response.json({ error: "Review not found." }, { status: 404 });

  try {
    return Response.json({ checkoutUrl: await checkoutForUnlock(sub, appOrigin(req)) });
  } catch (e) {
    if (e instanceof CheckoutError) return Response.json({ error: e.message }, { status: e.status });
    console.error("unlock checkout", e);
    return Response.json({ error: "We couldn't start checkout. Try again." }, { status: 500 });
  }
}

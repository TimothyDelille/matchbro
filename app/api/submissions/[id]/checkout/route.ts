import { configError, supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { parsePlan } from "@/lib/plans";
import { appOrigin, checkoutForSubmission, CheckoutError } from "@/lib/stripe";

// Room for the AI review that can start when a payment is confirmed here (lib/ai-review).
export const maxDuration = 300;

/** Resume payment for an uploaded submission (e.g. after cancelling on the Stripe page). */
export async function POST(req: Request, ctx: RouteContext<"/api/submissions/[id]/checkout">) {
  const misconfigured = configError();
  if (misconfigured) return Response.json({ error: misconfigured }, { status: 500 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const plan = parsePlan((await req.json().catch(() => null))?.plan);
  if (!plan) return Response.json({ error: "Pick a plan." }, { status: 400 });

  const { id } = await ctx.params;
  const { data: sub } = await supabaseAdmin()
    .from("submissions")
    .select("id, user_id, status, created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!sub) return Response.json({ error: "Submission not found." }, { status: 404 });

  try {
    return Response.json({ checkoutUrl: await checkoutForSubmission(sub, plan, appOrigin(req)) });
  } catch (e) {
    if (e instanceof CheckoutError) return Response.json({ error: e.message }, { status: e.status });
    console.error("checkout", e);
    return Response.json({ error: "We couldn't start checkout. Try again." }, { status: 500 });
  }
}

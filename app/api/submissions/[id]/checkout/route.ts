import { configError, supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { appOrigin, checkoutForSubmission, CheckoutError } from "@/lib/stripe";

/** Resume payment for an uploaded submission (e.g. after cancelling on the Stripe page). */
export async function POST(req: Request, ctx: RouteContext<"/api/submissions/[id]/checkout">) {
  const misconfigured = configError();
  if (misconfigured) return Response.json({ error: misconfigured }, { status: 500 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const { id } = await ctx.params;
  const { data: sub } = await supabaseAdmin()
    .from("submissions")
    .select("id, user_id, status, created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!sub) return Response.json({ error: "Submission not found." }, { status: 404 });

  try {
    return Response.json({ checkoutUrl: await checkoutForSubmission(sub, appOrigin(req)) });
  } catch (e) {
    if (e instanceof CheckoutError) return Response.json({ error: e.message }, { status: e.status });
    console.error("checkout", e);
    return Response.json({ error: "We couldn't start checkout. Try again." }, { status: 500 });
  }
}

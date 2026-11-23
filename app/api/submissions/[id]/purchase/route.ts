import { configError, supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { PurchaseError, recordPurchase } from "@/lib/revenuecat";

// Room for the AI review that starts once the purchase is recorded (lib/ai-review).
export const maxDuration = 300;

/** iOS in-app purchase (RevenueCat): pays for an upload or unlocks a review. Signed-in owner only. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const misconfigured = configError();
  if (misconfigured) return Response.json({ error: misconfigured }, { status: 500 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { transactionId?: unknown };
  const transactionId = typeof body.transactionId === "string" ? body.transactionId.trim() : "";
  if (!transactionId) return Response.json({ error: "Invalid request." }, { status: 400 });

  const { id } = await ctx.params;
  const { data: sub } = await supabaseAdmin()
    .from("submissions")
    .select("id, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!sub) return Response.json({ error: "Submission not found." }, { status: 404 });

  try {
    return Response.json({ status: await recordPurchase(sub, transactionId) });
  } catch (e) {
    if (e instanceof PurchaseError) return Response.json({ error: e.message }, { status: e.status });
    console.error("purchase", e);
    return Response.json({ error: "We couldn't confirm your purchase. Try again." }, { status: 500 });
  }
}

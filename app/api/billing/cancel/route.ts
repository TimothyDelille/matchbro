import { configError } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { cancelWeekly } from "@/lib/stripe";

/** Stop the signed-in user's weekly plan from renewing. They keep access until the paid week ends. */
export async function POST() {
  const misconfigured = configError();
  if (misconfigured) return Response.json({ error: misconfigured }, { status: 500 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  try {
    const plan = await cancelWeekly(user.id);
    if (plan?.plan !== "weekly") return Response.json({ error: "You don't have a weekly plan to cancel." }, { status: 404 });
    return Response.json({ ok: true, periodEnd: plan.periodEnd });
  } catch (e) {
    console.error("cancel weekly", e);
    return Response.json({ error: "We couldn't cancel your plan. Try again, or email support@matchbro.app." }, { status: 500 });
  }
}

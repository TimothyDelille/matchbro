import { configError } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { BillingError, resumeWeekly } from "@/lib/billing";

/** Undo a weekly cancellation before the paid week ends. */
export async function POST() {
  const misconfigured = configError();
  if (misconfigured) return Response.json({ error: misconfigured }, { status: 500 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  try {
    await resumeWeekly(user.id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof BillingError) return Response.json({ error: e.message }, { status: e.status });
    console.error("resume weekly", e);
    return Response.json({ error: "We couldn't restart your plan. Try again." }, { status: 500 });
  }
}

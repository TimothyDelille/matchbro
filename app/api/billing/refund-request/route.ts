import { configError } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { BillingError, requestRefund } from "@/lib/billing";

/** A lifetime customer asks for a refund (a reason is required). Support handles it by email. */
export async function POST(req: Request) {
  const misconfigured = configError();
  if (misconfigured) return Response.json({ error: misconfigured }, { status: 500 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason : "";

  try {
    await requestRefund(user.id, reason);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof BillingError) return Response.json({ error: e.message }, { status: e.status });
    console.error("refund request", e);
    return Response.json({ error: "We couldn't send your request. Email support@matchbro.app instead." }, { status: 500 });
  }
}

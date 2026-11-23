import { configError } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/stripe";
import { BillingError, upgradeCheckout } from "@/lib/billing";

/** Stripe Checkout for a weekly member moving to lifetime. */
export async function POST(req: Request) {
  const misconfigured = configError();
  if (misconfigured) return Response.json({ error: misconfigured }, { status: 500 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  try {
    return Response.json({ checkoutUrl: await upgradeCheckout(user.id, appOrigin(req)) });
  } catch (e) {
    if (e instanceof BillingError) return Response.json({ error: e.message }, { status: e.status });
    console.error("upgrade checkout", e);
    return Response.json({ error: "We couldn't start checkout. Try again." }, { status: 500 });
  }
}

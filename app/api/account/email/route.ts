import { configError, supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { claimPaidEmail } from "@/lib/stripe";
import { EMAIL_RE } from "@/lib/limits";

/**
 * iOS: after an in-app purchase, a guest gives the email Stripe Checkout would have asked for.
 * Same rules as Stripe: an email that already has an account gets the paid review moved to it.
 */
export async function POST(req: Request) {
  const misconfigured = configError();
  if (misconfigured) return Response.json({ error: misconfigured }, { status: 500 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { email?: unknown; submissionId?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });

  // Only a paid submission of theirs can claim an email (like a Stripe receipt).
  const { data: sub } = await supabaseAdmin()
    .from("submissions")
    .select("id")
    .eq("id", String(body.submissionId ?? ""))
    .eq("user_id", user.id)
    .not("paid_at", "is", null)
    .maybeSingle();
  if (!sub) return Response.json({ error: "Submission not found." }, { status: 404 });

  try {
    return Response.json(await claimPaidEmail(user.id, sub.id, email));
  } catch (e) {
    console.error("claim email", e);
    return Response.json({ error: "Couldn't save your email. Try again." }, { status: 500 });
  }
}

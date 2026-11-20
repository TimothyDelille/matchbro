import { configError, supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { cleanSource } from "@/lib/onboarding";

/** "Where did you hear of us?" (asked after payment): saved on their latest submission. */
export async function POST(req: Request) {
  if (configError()) return Response.json({ ok: false }, { status: 500 });
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const source = cleanSource((await req.json().catch(() => null))?.source);
  if (!source) return Response.json({ error: "Invalid request." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: sub, error } = await db
    .from("submissions")
    .select("id, onboarding")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error("source", error);
  if (sub) {
    const { error: saveError } = await db
      .from("submissions")
      .update({ onboarding: { ...(sub.onboarding ?? {}), source } })
      .eq("id", sub.id);
    if (saveError) console.error("source", saveError);
  }
  return Response.json({ ok: true });
}

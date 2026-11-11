import { configError, supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { isLocked } from "@/lib/stripe";
import { FOLLOW_UP_COLUMNS, MAX_QUESTION_CHARS } from "@/lib/follow-up";

/** Ask the free follow-up question on a published, unlocked review (signed-in owner, once per review). */
export async function POST(req: Request, ctx: RouteContext<"/api/submissions/[id]/follow-up">) {
  const misconfigured = configError();
  if (misconfigured) return Response.json({ error: misconfigured }, { status: 500 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { question?: unknown };
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ error: "Write your question first." }, { status: 400 });
  if (question.length > MAX_QUESTION_CHARS) {
    return Response.json({ error: `Keep it under ${MAX_QUESTION_CHARS} characters.` }, { status: 400 });
  }

  const { id } = await ctx.params;
  const db = supabaseAdmin();
  const { data: sub } = await db
    .from("submissions")
    .select("id, user_id, status, unlock_required, paid_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!sub) return Response.json({ error: "Review not found." }, { status: 404 });

  const { data: report } = await db.from("reports").select("published_at").eq("submission_id", id).maybeSingle();
  if (sub.status !== "done" || !report?.published_at) {
    return Response.json({ error: "You can ask once your review is ready." }, { status: 409 });
  }
  if (isLocked(sub)) return Response.json({ error: "Unlock the full review to ask a follow-up." }, { status: 402 });

  const { data, error } = await db
    .from("follow_ups")
    .insert({ submission_id: id, user_id: user.id, question })
    .select(FOLLOW_UP_COLUMNS)
    .single();
  if (error?.code === "23505") {
    return Response.json({ error: "You've already used your free follow-up on this review." }, { status: 409 });
  }
  if (error) {
    console.error("follow-up", error);
    return Response.json({ error: "Couldn't send your question. Try again." }, { status: 500 });
  }
  return Response.json({ followUp: data });
}

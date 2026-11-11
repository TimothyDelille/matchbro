import { adminOrResponse } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { FOLLOW_UP_COLUMNS, MAX_ANSWER_CHARS } from "@/lib/follow-up";

/** Answer (or edit the answer to) a user's follow-up question. Goes live for them on save. */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/submissions/[id]/follow-up">) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;

  const body = (await req.json().catch(() => ({}))) as { answer?: unknown };
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!answer) return Response.json({ error: "Write an answer first." }, { status: 400 });
  if (answer.length > MAX_ANSWER_CHARS) {
    return Response.json({ error: `Answers must be under ${MAX_ANSWER_CHARS} characters.` }, { status: 400 });
  }

  const { id } = await ctx.params;
  const db = supabaseAdmin();
  const { data: existing } = await db.from("follow_ups").select("answered_at").eq("submission_id", id).maybeSingle();
  if (!existing) return Response.json({ error: "No follow-up question on this review." }, { status: 404 });

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("follow_ups")
    .update({ answer, answered_at: existing.answered_at ?? now, updated_at: now })
    .eq("submission_id", id)
    .select(FOLLOW_UP_COLUMNS)
    .single();
  if (error) {
    console.error("answer follow-up", error);
    return Response.json({ error: "Couldn't save the answer. Try again." }, { status: 500 });
  }
  return Response.json({ followUp: data });
}

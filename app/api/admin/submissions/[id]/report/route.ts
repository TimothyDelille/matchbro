import { adminOrResponse } from "@/lib/admin-auth";
import { REPORT_DIR, saveReport } from "@/lib/report";
import { parseScores } from "@/lib/score";

/** Save the report as a draft (publish: false) or publish it to the user (publish: true). */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/submissions/[id]/report">) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    markdown?: unknown;
    audioPath?: unknown;
    scores?: unknown;
    publish?: unknown;
  };
  const markdown = typeof body.markdown === "string" ? body.markdown : "";
  const audioPath =
    typeof body.audioPath === "string" && body.audioPath.startsWith(`${REPORT_DIR}/`) ? body.audioPath : null;
  const scores = parseScores(body.scores);
  const publish = body.publish === true;

  if (publish && !markdown.trim() && !audioPath) {
    return Response.json({ error: "Write something or add a voice note before publishing." }, { status: 400 });
  }

  try {
    const { publishedAt } = await saveReport(id, { markdown, audioPath, scores, publish });
    return Response.json({ publishedAt, savedAt: new Date().toISOString() });
  } catch (e) {
    console.error("save report", e);
    return Response.json({ error: "Couldn't save the report. Try again." }, { status: 500 });
  }
}

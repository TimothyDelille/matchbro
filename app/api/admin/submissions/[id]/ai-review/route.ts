import { adminOrResponse } from "@/lib/admin-auth";
import { generateAiReview } from "@/lib/ai-review";

export const maxDuration = 300;

/** Generate an AI review for the editor. Nothing is saved: the admin edits, then saves or publishes. */
export async function POST(_req: Request, ctx: RouteContext<"/api/admin/submissions/[id]/ai-review">) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY isn't set." }, { status: 500 });
  }

  const { id } = await ctx.params;
  try {
    return Response.json(await generateAiReview(id));
  } catch (e) {
    console.error("ai draft", id, e);
    return Response.json({ error: "The AI review failed. Try again." }, { status: 500 });
  }
}

import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { otherProfileScores, referencedAssets, signAssets, signSubmissionMedia } from "@/lib/report";
import { SCORE_COLUMNS, profileScore, scoreDistribution, scoresFromRow } from "@/lib/score";
import { isLocked } from "@/lib/stripe";
import { FOLLOW_UP_COLUMNS } from "@/lib/follow-up";
import { aiReviewMode } from "@/lib/ai-review";
import { realEmail } from "@/lib/guest";

/**
 * Everything /reviews/[id] shows, as JSON for the iOS app (owner only).
 * `report` is null until the review is published. A locked review has scores but no text.
 * Report image paths in the markdown are already swapped for signed URLs.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const { data: sub } = await supabase
    .from("submissions")
    .select("file_paths, unlock_required, paid_at, status")
    .eq("id", id)
    .maybeSingle();
  if (!sub) return Response.json({ error: "Not found." }, { status: 404 });

  // RLS hides locked reports from owners; ownership was checked by the read above.
  const locked = isLocked(sub);
  const { data: report } = await (locked ? supabaseAdmin() : supabase)
    .from("reports")
    .select(`user_id, markdown, audio_path, published_at, ${SCORE_COLUMNS}`)
    .eq("submission_id", id)
    .maybeSingle();

  const media = await signSubmissionMedia(sub.file_paths ?? []);
  const base = {
    status: sub.status,
    paid: Boolean(sub.paid_at),
    email: realEmail(user.email),
    autoReview: aiReviewMode() === "publish",
    media,
  };
  const noStore = { headers: { "Cache-Control": "no-store" } };
  if (!report?.published_at) return Response.json({ ...base, report: null }, noStore);

  const [assets, followUp, others] = await Promise.all([
    locked ? {} : signAssets(report.user_id, id, referencedAssets(report.markdown, report.audio_path)),
    locked
      ? null
      : supabase.from("follow_ups").select(FOLLOW_UP_COLUMNS).eq("submission_id", id).maybeSingle().then(({ data }) => data),
    otherProfileScores(id),
  ]);
  const scores = scoresFromRow(report);
  const total = profileScore(scores);
  const signed = assets as Record<string, string>;

  return Response.json(
    {
      ...base,
      report: {
        publishedAt: report.published_at,
        locked,
        scores,
        total,
        distribution: total === null ? null : scoreDistribution(total, others),
        markdown: locked ? null : report.markdown.replace(/\]\((report\/[^)\s]+)/g, (m: string, p: string) => (signed[p] ? `](${signed[p]}` : m)),
        audioUrl: !locked && report.audio_path ? (signed[report.audio_path] ?? null) : null,
        followUp,
      },
    },
    noStore,
  );
}

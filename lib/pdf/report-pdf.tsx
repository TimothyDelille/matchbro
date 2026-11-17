import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { referencedAssets, signAssets } from "@/lib/report";
import { SCORE_COLUMNS, scoresFromRow } from "@/lib/score";
import { ReportDocument } from "@/lib/pdf/ReportDocument";

/**
 * Render a submission's report as a PDF (score + written review, without the
 * user's submitted photos). Returns null if there's no report yet.
 * Use it for the admin download, or to attach the report to an email.
 */
export async function renderReportPdf(submissionId: string): Promise<{ pdf: Buffer; fileName: string } | null> {
  const db = supabaseAdmin();
  const { data: report } = await db
    .from("reports")
    .select(`user_id, markdown, published_at, updated_at, ${SCORE_COLUMNS}`)
    .eq("submission_id", submissionId)
    .maybeSingle();
  if (!report) return null;

  const [{ data: profile }, assets] = await Promise.all([
    db.from("profiles").select("email").eq("id", report.user_id).maybeSingle(),
    // Only images the reviewer put in the report itself (never the user's uploads).
    signAssets(report.user_id, submissionId, referencedAssets(report.markdown, null)),
  ]);

  const date = new Date(report.published_at ?? report.updated_at);
  const pdf = await renderToBuffer(
    <ReportDocument
      markdown={report.markdown}
      scores={scoresFromRow(report)}
      assets={assets}
      date={date}
      draft={!report.published_at}
    />,
  );

  const handle = (profile?.email ?? "review").split("@")[0].replace(/[^a-z0-9_-]+/gi, "-");
  return { pdf, fileName: `matchbro-review-${handle}-${date.toISOString().slice(0, 10)}.pdf` };
}

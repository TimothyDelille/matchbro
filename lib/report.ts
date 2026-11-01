import "server-only";
import { BUCKET, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Report files live inside the submission's folder:
 *   {userId}/{submissionId}/report/{file}
 * The markdown refers to them by the short path "report/{file}".
 */
export const REPORT_DIR = "report";

export const folderOf = (userId: string, submissionId: string) => `${userId}/${submissionId}`;

/** All "report/..." paths referenced by a report (images in the markdown + the voice note). */
export function referencedAssets(markdown: string, audioPath: string | null): string[] {
  const refs = new Set<string>();
  for (const m of markdown.matchAll(/\]\((report\/[^)\s]+)/g)) refs.add(m[1]);
  if (audioPath) refs.add(audioPath);
  return [...refs];
}

/** Signed URLs (1 hour) for short "report/..." paths, keyed by the short path. */
export async function signAssets(
  userId: string,
  submissionId: string,
  shortPaths: string[],
): Promise<Record<string, string>> {
  if (!shortPaths.length) return {};
  const folder = folderOf(userId, submissionId);
  const { data } = await supabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUrls(
      shortPaths.map((p) => `${folder}/${p}`),
      3600,
    );
  const out: Record<string, string> = {};
  data?.forEach((d, i) => {
    if (d.signedUrl) out[shortPaths[i]] = d.signedUrl;
  });
  return out;
}

/** Delete report files that the final report no longer uses (replaced recordings, removed images). */
export async function pruneUnusedAssets(userId: string, submissionId: string, keep: string[]) {
  const db = supabaseAdmin();
  const folder = folderOf(userId, submissionId);
  const { data } = await db.storage.from(BUCKET).list(`${folder}/${REPORT_DIR}`, { limit: 1000 });
  const unused = (data ?? [])
    .map((o) => `${REPORT_DIR}/${o.name}`)
    .filter((p) => !keep.includes(p))
    .map((p) => `${folder}/${p}`);
  if (unused.length) await db.storage.from(BUCKET).remove(unused);
}

export type ReportInput = { markdown: string; audioPath: string | null; publish: boolean };

/**
 * Save a report draft, or publish it to the user.
 * Publishing marks the submission done and removes report files the final text
 * no longer uses. The user's original recordings are kept (until they ask for
 * them to be deleted), next to the report's images and voice note.
 */
export async function saveReport(submissionId: string, input: ReportInput) {
  const db = supabaseAdmin();
  const { data: sub, error } = await db
    .from("submissions")
    .select("user_id, status, file_paths")
    .eq("id", submissionId)
    .single();
  if (error) throw error;

  const { data: existing } = await db
    .from("reports")
    .select("published_at")
    .eq("submission_id", submissionId)
    .maybeSingle();

  const now = new Date().toISOString();
  const publishedAt = input.publish ? (existing?.published_at ?? now) : (existing?.published_at ?? null);

  const { error: upsertError } = await db.from("reports").upsert(
    {
      submission_id: submissionId,
      user_id: sub.user_id,
      markdown: input.markdown,
      audio_path: input.audioPath,
      published_at: publishedAt,
      updated_at: now,
    },
    { onConflict: "submission_id" },
  );
  if (upsertError) throw upsertError;

  if (input.publish) {
    await pruneUnusedAssets(sub.user_id, submissionId, referencedAssets(input.markdown, input.audioPath));
    await db
      .from("submissions")
      .update({ status: "done", reviewed_at: sub.status === "done" ? undefined : now })
      .eq("id", submissionId);
  } else if (sub.status === "queued") {
    await db.from("submissions").update({ status: "reviewing" }).eq("id", submissionId);
  }

  return { publishedAt };
}

export type MediaItem = { url: string; name: string; kind: "video" | "image" };

/** Signed URLs (1 hour) for the files the user submitted, in upload order. */
export async function signSubmissionMedia(filePaths: string[]): Promise<MediaItem[]> {
  if (!filePaths.length) return [];
  const { data } = await supabaseAdmin().storage.from(BUCKET).createSignedUrls(filePaths, 3600);
  return (data ?? [])
    .filter((d) => d.signedUrl)
    .map((d) => {
      const name = (d.path ?? "").split("/").pop() ?? "file";
      return {
        url: d.signedUrl!,
        name: name.replace(/^\d+-/, ""),
        kind: /\.(mp4|mov|webm|m4v)$/i.test(name) ? ("video" as const) : ("image" as const),
      };
    });
}

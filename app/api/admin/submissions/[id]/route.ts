import type { SupabaseClient } from "@supabase/supabase-js";
import { adminOrResponse } from "@/lib/admin-auth";
import { BUCKET, supabaseAdmin } from "@/lib/supabase/admin";
import { folderOf } from "@/lib/report";

/** Every object under a storage folder, including subfolders (e.g. report/). */
async function listAll(db: SupabaseClient, folder: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(BUCKET).list(folder, { limit: 1000, offset });
    if (error) throw error;
    for (const entry of data ?? []) {
      const path = `${folder}/${entry.name}`;
      // Folders come back without an id.
      if (entry.id) paths.push(path);
      else paths.push(...(await listAll(db, path)));
    }
    if (!data || data.length < 1000) return paths;
  }
}

/**
 * Permanently delete a submission: its uploads and report files in storage,
 * then the submission row. reports, follow_ups and payments rows go with it
 * (their foreign keys cascade on delete).
 */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/submissions/[id]">) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;

  const { id } = await ctx.params;
  const db = supabaseAdmin();
  const { data: sub } = await db.from("submissions").select("user_id, file_paths").eq("id", id).maybeSingle();
  if (!sub) return Response.json({ error: "Submission not found." }, { status: 404 });

  try {
    // Files first: if this fails the row stays, so the delete can be retried without leaving orphans.
    const paths = new Set([...(sub.file_paths ?? []), ...(await listAll(db, folderOf(sub.user_id, id)))]);
    const all = [...paths];
    for (let i = 0; i < all.length; i += 1000) {
      const { error } = await db.storage.from(BUCKET).remove(all.slice(i, i + 1000));
      if (error) throw error;
    }

    const { error } = await db.from("submissions").delete().eq("id", id);
    if (error) throw error;
  } catch (e) {
    console.error("delete submission", e);
    return Response.json({ error: "Couldn't delete the submission. Try again." }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}

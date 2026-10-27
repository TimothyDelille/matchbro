import "server-only";
import { createClient } from "@supabase/supabase-js";

export const BUCKET = "submissions";

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getSetting(name: string): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from("app_settings")
    .select("value")
    .eq("key", name)
    .single();
  if (error) throw error;
  return Number(data.value);
}

/** Find the account for this email, or create one. Phone is kept on the profile. */
export async function findOrCreateUser(email: string, phone: string): Promise<string> {
  const db = supabaseAdmin();

  const { data: existing } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) {
    await db.from("profiles").update({ phone }).eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await db.auth.admin.createUser({
    email,
    email_confirm: true, // they sign in later with a one-time code sent to this email
    user_metadata: { phone },
  });
  if (error || !data.user) throw error ?? new Error("Could not create account");

  const { error: profileError } = await db
    .from("profiles")
    .insert({ id: data.user.id, email, phone });
  if (profileError) throw profileError;

  return data.user.id;
}

/** Remove files from abandoned uploads so they don't eat storage. */
export async function sweepExpiredUploads() {
  const db = supabaseAdmin();
  const { data } = await db
    .from("submissions")
    .select("id, file_paths")
    .eq("status", "expired")
    .neq("file_paths", "{}")
    .limit(50);
  for (const row of data ?? []) {
    await db.storage.from(BUCKET).remove(row.file_paths);
    await db.from("submissions").update({ file_paths: [], total_bytes: 0 }).eq("id", row.id);
  }
}

/**
 * Call this from the (future) review tool: publishes the report, marks the
 * submission done and deletes the recordings to free up storage.
 */
export async function publishReport(submissionId: string, content: Record<string, unknown>) {
  const db = supabaseAdmin();
  const { data: sub, error } = await db
    .from("submissions")
    .select("user_id, file_paths")
    .eq("id", submissionId)
    .single();
  if (error) throw error;

  await db.from("reports").upsert(
    { submission_id: submissionId, user_id: sub.user_id, content, published_at: new Date().toISOString() },
    { onConflict: "submission_id" },
  );
  if (sub.file_paths.length) await db.storage.from(BUCKET).remove(sub.file_paths);
  await db
    .from("submissions")
    .update({ status: "done", reviewed_at: new Date().toISOString(), file_paths: [], total_bytes: 0 })
    .eq("id", submissionId);
}

import "server-only";
import { createClient } from "@supabase/supabase-js";

export const BUCKET = "submissions";

/** Message to show when the server can't reach Supabase because env vars are missing. */
export function configError(): string | null {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return process.env.NODE_ENV === "development"
    ? "Server setup: SUPABASE_SERVICE_ROLE_KEY is missing from .env.local. Add it and restart npm run dev."
    : "We can't take submissions right now. Try again later.";
}

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

/**
 * Create an account for a first-time visitor. Returns null if the email
 * already has one: returning users must sign in, so nobody can submit under
 * (or change the phone number on) someone else's account.
 */
export async function createAccount(email: string, phone: string, password: string): Promise<string | null> {
  const db = supabaseAdmin();

  const { data: existing } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) return null;

  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no confirmation email for now; they sign in with email + password
    user_metadata: { phone },
  });
  if (error?.code === "email_exists") return null;
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

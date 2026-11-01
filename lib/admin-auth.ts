import "server-only";
import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { currentUser } from "@/lib/supabase/server";

/** Admins are users with app_metadata.role = "admin" (only the secret key can set it). */
export function isAdmin(user: User | null | undefined): boolean {
  return user?.app_metadata?.role === "admin";
}

/** For admin pages: sends signed-out visitors to sign in, hides the page from everyone else. */
export async function requireAdmin(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (!isAdmin(user)) notFound();
  return user;
}

/** For admin API routes: returns a 404 response unless the caller is an admin. */
export async function adminOrResponse(): Promise<User | Response> {
  const user = await currentUser();
  if (!isAdmin(user)) return Response.json({ error: "Not found" }, { status: 404 });
  return user!;
}

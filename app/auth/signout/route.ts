import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/next-path";

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  const form = await request.formData().catch(() => null);
  const next = safeNextPath(form?.get("next")?.toString());
  return NextResponse.redirect(new URL(next ?? "/", request.url), { status: 303 });
}

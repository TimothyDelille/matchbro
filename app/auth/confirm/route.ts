import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/next-path";

/** Landing spot for the sign-in link in the email (works alongside the 6-digit code). */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await supabaseServer();
  let ok = false;

  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  const next = safeNextPath(searchParams.get("next"));
  const destination = ok ? (next ?? "/home") : `/signin?expired=1${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  return NextResponse.redirect(new URL(destination, request.url));
}

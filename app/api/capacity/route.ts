import { configError, supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  if (configError()) return Response.json({ error: "unavailable" }, { status: 503 });
  const { data, error } = await supabaseAdmin().rpc("capacity").single<{ is_full: boolean }>();
  if (error) return Response.json({ error: "unavailable" }, { status: 503 });
  return Response.json({ full: Boolean(data.is_full) }, { headers: { "Cache-Control": "no-store" } });
}

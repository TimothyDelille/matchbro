import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const { data, error } = await supabaseAdmin().rpc("capacity").single<{
    open_count: number;
    max_open: number;
  }>();
  if (error) return Response.json({ error: "unavailable" }, { status: 503 });

  const left = Math.max(0, Number(data.max_open) - Number(data.open_count));
  return Response.json({ left, full: left === 0 }, { headers: { "Cache-Control": "no-store" } });
}

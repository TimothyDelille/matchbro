import { supabaseServer } from "@/lib/supabase/server";

/** Polled by the "analyzing your profile" screen until the review is published. Owner only (RLS). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data } = await (await supabaseServer()).from("submissions").select("status").eq("id", id).maybeSingle();
  if (!data) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ status: data.status }, { headers: { "Cache-Control": "no-store" } });
}

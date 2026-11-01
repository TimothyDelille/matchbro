import { adminOrResponse } from "@/lib/admin-auth";
import { BUCKET, supabaseAdmin } from "@/lib/supabase/admin";
import { folderOf, REPORT_DIR } from "@/lib/report";

const REPORT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
];
const MAX_BYTES = 50 * 1024 * 1024;

const safeName = (name: string) =>
  name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-60) || "file";

/** Signed upload URL for a report image or voice note, stored next to the submission. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/submissions/[id]/assets">) {
  const admin = await adminOrResponse();
  if (admin instanceof Response) return admin;

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { name?: string; type?: string; size?: number };
  const type = (body.type ?? "").split(";")[0];
  if (!REPORT_TYPES.includes(type)) {
    return Response.json({ error: "Only images and audio files can go in a report." }, { status: 400 });
  }
  if (Number(body.size) > MAX_BYTES) {
    return Response.json({ error: "Files must be under 50 MB." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: sub } = await db.from("submissions").select("user_id").eq("id", id).maybeSingle();
  if (!sub) return Response.json({ error: "Submission not found." }, { status: 404 });

  const shortPath = `${REPORT_DIR}/${Date.now()}-${safeName(body.name ?? "file")}`;
  const path = `${folderOf(sub.user_id, id)}/${shortPath}`;
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return Response.json({ error: "Could not start the upload." }, { status: 500 });

  return Response.json({ path, shortPath, token: data.token });
}

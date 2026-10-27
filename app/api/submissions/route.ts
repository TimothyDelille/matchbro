import { BUCKET, findOrCreateUser, getSetting, supabaseAdmin, sweepExpiredUploads } from "@/lib/supabase/admin";
import { ACCEPTED_TYPES, EMAIL_RE, MAX_FILES, normalizePhone } from "@/lib/limits";

type FileMeta = { name: string; type: string; size: number };

const fail = (error: string, status = 400) => Response.json({ error }, { status });

const safeName = (name: string) =>
  name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-80) || "file";

/** Step 1: create/find the account, reserve a slot, hand back signed upload URLs. */
export async function POST(req: Request) {
  let body: { email?: string; phone?: string; files?: FileMeta[]; website?: string };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request.");
  }

  if (body.website) return fail("Invalid request."); // honeypot

  const email = (body.email ?? "").trim().toLowerCase();
  const phone = normalizePhone(body.phone ?? "");
  const files = Array.isArray(body.files) ? body.files : [];

  if (!EMAIL_RE.test(email)) return fail("Enter a valid email address.");
  if (!phone) return fail("Enter a valid phone number.");
  if (files.length === 0) return fail("Add at least one recording or screenshot.");
  if (files.length > MAX_FILES) return fail(`You can add up to ${MAX_FILES} files.`);
  if (files.some((f) => !ACCEPTED_TYPES.includes(f.type))) {
    return fail("Only videos (MP4, MOV, WebM) and images (JPG, PNG, HEIC, WebP) are accepted.");
  }

  const maxBytes = await getSetting("max_submission_bytes");
  const total = files.reduce((n, f) => n + Number(f.size || 0), 0);
  if (total > maxBytes) {
    return fail(`Files add up to more than ${Math.round(maxBytes / 1024 / 1024)} MB. Trim the recording and try again.`);
  }

  const db = supabaseAdmin();
  await sweepExpiredUploads();

  let userId: string;
  try {
    userId = await findOrCreateUser(email, phone);
  } catch (e) {
    console.error("account", e);
    return fail("We couldn't create your account. Try again.", 500);
  }

  const { data: submissionId, error: reserveError } = await db.rpc("reserve_submission", {
    p_user_id: userId,
  });
  if (reserveError) {
    if (reserveError.message.includes("at_capacity")) {
      return fail("We're full right now. Check back soon.", 409);
    }
    if (reserveError.message.includes("already_in_line")) {
      return fail("You're already in line. We'll email you when your roast is ready.", 409);
    }
    console.error("reserve", reserveError);
    return fail("Something went wrong. Try again.", 500);
  }

  const uploads: { path: string; token: string }[] = [];
  for (const [i, f] of files.entries()) {
    const path = `${userId}/${submissionId}/${i + 1}-${safeName(f.name)}`;
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      console.error("signed url", error);
      await db.from("submissions").update({ status: "expired" }).eq("id", submissionId);
      return fail("Something went wrong. Try again.", 500);
    }
    uploads.push({ path, token: data.token });
  }

  await db
    .from("submissions")
    .update({ file_paths: uploads.map((u) => u.path), total_bytes: total })
    .eq("id", submissionId);

  return Response.json({ submissionId, uploads });
}

import { BUCKET, configError, createAccount, getSetting, supabaseAdmin, sweepExpiredUploads } from "@/lib/supabase/admin";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { ACCEPTED_TYPES, EMAIL_RE, MAX_FILES, MIN_PASSWORD, normalizePhone } from "@/lib/limits";

type FileMeta = { name: string; type: string; size: number };

const fail = (error: string, status = 400) => Response.json({ error }, { status });

const safeName = (name: string) =>
  name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-80) || "file";

/** Step 1: create/find the account, reserve a slot, hand back signed upload URLs. */
export async function POST(req: Request) {
  const misconfigured = configError();
  if (misconfigured) return fail(misconfigured, 500);

  let body: { email?: string; phone?: string; password?: string; files?: FileMeta[]; website?: string };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request.");
  }

  if (body.website) return fail("Invalid request."); // honeypot

  const sessionUser = await currentUser();
  const email = (body.email ?? "").trim().toLowerCase();
  const phone = normalizePhone(body.phone ?? "");
  const files = Array.isArray(body.files) ? body.files : [];

  if (!sessionUser) {
    if (!EMAIL_RE.test(email)) return fail("Enter a valid email address.");
    if (!phone) return fail("Enter a valid phone number.");
    if (typeof body.password !== "string" || body.password.length < MIN_PASSWORD) {
      return fail(`Use at least ${MIN_PASSWORD} characters for your password.`);
    }
  }
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
  if (sessionUser) {
    userId = sessionUser.id;
  } else {
    try {
      const created = await createAccount(email, phone!, body.password!);
      if (!created) {
        return Response.json(
          { error: "You already have an account with this email. Sign in to send another profile.", signIn: true },
          { status: 409 },
        );
      }
      userId = created;
      // Sign them in right away (sets the session cookie on this response).
      const { error: signInError } = await (await supabaseServer()).auth.signInWithPassword({
        email,
        password: body.password!,
      });
      if (signInError) console.error("sign in after sign up", signInError);
    } catch (e) {
      if ((e as { code?: string })?.code === "weak_password") {
        return fail("That password is too easy to guess. Try a longer one.");
      }
      console.error("account", e);
      return fail("We couldn't create your account. Try again.", 500);
    }
  }

  // TODO(stripe): once reviews are paid, check the user has an unused credit here.
  const { data: submissionId, error: reserveError } = await db.rpc("reserve_submission", {
    p_user_id: userId,
  });
  if (reserveError) {
    if (reserveError.message.includes("at_capacity")) {
      return fail("We're full right now. Check back soon.", 409);
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

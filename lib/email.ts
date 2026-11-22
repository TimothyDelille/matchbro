import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { realEmail } from "@/lib/guest";
import { DEMO_EMAILS } from "@/lib/demo";

/**
 * Transactional email through Resend (https://resend.com), called with fetch.
 * Without RESEND_API_KEY nothing is sent (logged instead), so local dev works without it.
 *
 *   RESEND_API_KEY=re_…
 *   APP_URL=https://matchbro.app                        # where links point (localhost in dev)
 */

function siteUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  return process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://matchbro.app";
}

type Email = { to: string; subject: string; html: string; text: string; idempotencyKey: string };

async function send(email: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`email skipped (RESEND_API_KEY not set): "${email.subject}" to ${email.to}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // Resend drops a repeat with the same key (24h), so a double publish can't send twice.
      "Idempotency-Key": email.idempotencyKey,
    },
    body: JSON.stringify({ from: "matchbro <support@matchbro.app>", to: [email.to], subject: email.subject, html: email.html, text: email.text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(title: string, body: string, cta: { href: string; label: string }) {
  return `<!doctype html><html><body style="margin:0;background:#faf7f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#17121c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;padding:32px">
<tr><td style="font-size:18px;font-weight:800">matchbro.app 🔥</td></tr>
<tr><td style="padding-top:24px;font-size:26px;line-height:1.2;font-weight:800">${title}</td></tr>
<tr><td style="padding-top:12px;font-size:16px;line-height:1.5;color:#4a4450">${body}</td></tr>
<tr><td style="padding-top:28px"><a href="${cta.href}" style="display:inline-block;background:#17121c;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px">${escape(cta.label)}</a></td></tr>
<tr><td style="padding-top:28px;font-size:13px;color:#8a8490">Questions? Just reply to this email or write to support@matchbro.app.</td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * "Your review is ready", sent the first time a review is published (AI or by hand).
 * Locked reviews (published before payment) get a "your score is in, unlock it" version.
 * Skips guest accounts (no real email yet) and demo accounts. Never throws.
 */
export async function sendReviewReadyEmail(submissionId: string, opts: { score: number | null; locked: boolean }) {
  try {
    const db = supabaseAdmin();
    const { data: sub } = await db.from("submissions").select("user_id").eq("id", submissionId).single();
    if (!sub) return;
    const { data: profile } = await db.from("profiles").select("email").eq("id", sub.user_id).maybeSingle();
    const to = realEmail(profile?.email);
    if (!to || DEMO_EMAILS.includes(to.toLowerCase())) return;

    const href = `${siteUrl()}/reviews/${submissionId}`;
    const scoreLine = opts.score === null ? "" : `Your profile scored <strong>${opts.score}/100</strong>. `;
    const scoreText = opts.score === null ? "" : `Your profile scored ${opts.score}/100. `;

    const email: Email = opts.locked
      ? {
          to,
          subject: "Your Hinge profile score is in 🔥",
          html: layout(
            "Your score is in",
            `${scoreLine}The full review, with exactly what to change in your pictures and prompts, is waiting for you.`,
            { href, label: "See my score" },
          ),
          text: `${scoreText}The full review, with exactly what to change in your pictures and prompts, is waiting for you: ${href}`,
          idempotencyKey: `review-ready-locked/${submissionId}`,
        }
      : {
          to,
          subject: "Your profile review is ready 🔥",
          html: layout(
            "Your review is ready",
            `${scoreLine}Here's what's working, what's holding you back, and exactly what to change.`,
            { href, label: "Read my review" },
          ),
          text: `${scoreText}Here's what's working, what's holding you back, and exactly what to change: ${href}`,
          idempotencyKey: `review-ready/${submissionId}`,
        };

    await send(email);
    console.info(`email "review ready" sent for ${submissionId}`);
  } catch (e) {
    console.error("review ready email", submissionId, e);
  }
}

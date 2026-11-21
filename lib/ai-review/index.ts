import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { saveReport } from "@/lib/report";
import type { Scores } from "@/lib/score";
import { describeOnboarding } from "@/lib/onboarding";
import { prepareSubmissionImages } from "./media";

/**
 * AI reviews. When a submission is paid (lib/stripe.ts markSessionPaid), Claude
 * reads the screenshots / recording frames, scores pictures and prompts and
 * writes the review. Its instructions are lib/ai-review/prompt.txt, word for word.
 *
 * AI_REVIEW_MODE (needs ANTHROPIC_API_KEY, otherwise everything stays manual):
 *   publish (default) – publish straight to the user
 *   draft             – save as a draft; an admin checks it and publishes
 *   off               – manual reviews only (admins can still click "AI draft")
 */
export type AiReviewMode = "publish" | "draft" | "off";

export function aiReviewMode(): AiReviewMode {
  if (!process.env.ANTHROPIC_API_KEY) return "off";
  const mode = process.env.AI_REVIEW_MODE;
  return mode === "draft" || mode === "off" ? mode : "publish";
}

const MODEL = process.env.AI_REVIEW_MODEL || "claude-opus-5-5";

/** The system prompt, read on every call so edits apply without a restart. */
const PROMPT_PATH = path.join(process.cwd(), "lib/ai-review/prompt.txt");

/**
 * Structured output: the API constrains Claude's reply to JSON matching this
 * schema, so the reply text always parses. JSON Schema min/max isn't enforced
 * there, which is why toScore() still checks the range.
 */
const score = (what: string) => ({
  anyOf: [{ type: "integer" }, { type: "null" }],
  description: `${what} score, 1-100. null only if you can't see any ${what} at all.`,
});
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    review: { type: "string", description: "The full review, in Markdown, addressed to them." },
    pictures_score: score("pictures"),
    prompts_score: score("prompts"),
  },
  required: ["review", "pictures_score", "prompts_score"],
  additionalProperties: false,
};

/** A whole number clamped to 1-100, or null. */
function toScore(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.min(100, Math.max(1, Math.round(v)));
}

function userIntro(onboarding: [string, string][], skipped: string[], imageCount: number): string {
  const lines = [
    `Here is the profile to review: ${imageCount} image(s), in the order they were submitted. Frames from a screen recording overlap; treat them as one scroll through the profile.`,
  ];
  if (onboarding.length) {
    lines.push("What they told us before submitting (go deeper on their focus):", ...onboarding.map(([q, a]) => `- ${q}: ${a}`));
  }
  if (skipped.length) lines.push(`These files couldn't be opened and aren't shown: ${skipped.join(", ")}.`);
  return lines.join("\n");
}

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

export type AiReview = { markdown: string; scores: Scores };

/** Ask Claude for a review of this submission. Doesn't write anything. */
export async function generateAiReview(submissionId: string): Promise<AiReview> {
  const { data: sub, error } = await supabaseAdmin()
    .from("submissions")
    .select("file_paths, onboarding")
    .eq("id", submissionId)
    .single();
  if (error) throw error;

  const { images, skipped } = await prepareSubmissionImages(sub.file_paths ?? []);
  if (!images.length) throw new Error("No readable images in this submission");

  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: userIntro(describeOnboarding(sub.onboarding), skipped, images.length) },
  ];
  for (const img of images) {
    content.push({ type: "text", text: img.label });
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
  }

  const message = await anthropic()
    .messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system: await readFile(PROMPT_PATH, "utf8"),
      messages: [{ role: "user", content }],
      output_config: { effort: "high", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    })
    .finalMessage();

  if (message.stop_reason !== "end_turn") throw new Error(`Claude stopped early: ${message.stop_reason}`);
  const text = message.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Claude returned no text");

  const parsed = JSON.parse(text) as { review?: unknown; pictures_score?: unknown; prompts_score?: unknown };
  const markdown = typeof parsed.review === "string" ? parsed.review.trim() : "";
  const scores: Scores = {
    pictures: toScore(parsed.pictures_score),
    prompts: toScore(parsed.prompts_score),
    conversation: null, // not reviewed for now: nobody sends chats or settings
    settings: null,
  };
  if (!markdown || (scores.pictures === null && scores.prompts === null)) {
    throw new Error("Claude's review is missing the text or both scores");
  }
  console.log(`ai review ${submissionId}: ${images.length} images, ${message.usage.input_tokens} in / ${message.usage.output_tokens} out`);
  return { markdown, scores };
}

/**
 * Review a paid submission and save/publish it. Safe to call many times: only
 * the call that moves it from "queued" to "reviewing" does the work. Locked
 * submissions (an admin already published a review) are skipped. On failure the
 * submission goes back to "queued" for a human.
 */
export async function autoReview(submissionId: string) {
  const mode = aiReviewMode();
  if (mode === "off") return;
  const db = supabaseAdmin();

  const { data: claimed, error } = await db
    .from("submissions")
    .update({ status: "reviewing" })
    .eq("id", submissionId)
    .eq("status", "queued")
    .eq("unlock_required", false)
    .select("id");
  if (error) throw error;
  if (!claimed?.length) return;

  // An admin already started a draft: leave it to them.
  const { data: existing } = await db.from("reports").select("submission_id").eq("submission_id", submissionId).maybeSingle();
  if (existing) return;

  try {
    const review = await generateAiReview(submissionId);
    await saveReport(submissionId, { markdown: review.markdown, audioPath: null, scores: review.scores, publish: mode === "publish" });
  } catch (e) {
    console.error(`ai review ${submissionId} failed, back to the manual queue`, e);
    await db.from("submissions").update({ status: "queued" }).eq("id", submissionId).eq("status", "reviewing");
  }
}

/** Run autoReview after the current response is sent (falls back to a detached promise outside a request). */
export function scheduleAiReview(submissionId: string) {
  if (aiReviewMode() === "off") {
    console.info(`ai review ${submissionId}: skipped (${process.env.ANTHROPIC_API_KEY ? "AI_REVIEW_MODE=off" : "ANTHROPIC_API_KEY not set"})`);
    return;
  }
  console.info(`ai review ${submissionId}: starting (${aiReviewMode()})`);
  const task = () => autoReview(submissionId).catch((e) => console.error("ai review", submissionId, e));
  try {
    after(task);
  } catch {
    void task();
  }
}

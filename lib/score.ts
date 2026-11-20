/**
 * Profile score: reviewers score each rubric 0–100 (null = N/A / not scored).
 * The profile score is the rounded average of the rubrics that were scored.
 * Shared by the admin editor (client) and the review page (server).
 */
export const RUBRICS = [
  { key: "pictures", label: "Pictures", optional: false },
  { key: "prompts", label: "Prompts", optional: false },
  { key: "conversation", label: "Conversation", optional: true },
  { key: "settings", label: "Settings", optional: true },
] as const;

export type RubricKey = (typeof RUBRICS)[number]["key"];
export type Scores = Record<RubricKey, number | null>;

/** The `reports` columns that hold each rubric's score. */
export const SCORE_COLUMNS = "score_pictures, score_prompts, score_conversation, score_settings";

type ScoreRow = Partial<Record<`score_${RubricKey}`, number | null>>;

export function scoresFromRow(row: ScoreRow | null | undefined): Scores {
  return {
    pictures: row?.score_pictures ?? null,
    prompts: row?.score_prompts ?? null,
    conversation: row?.score_conversation ?? null,
    settings: row?.score_settings ?? null,
  };
}

export function scoresToRow(s: Scores): Required<ScoreRow> {
  return {
    score_pictures: s.pictures,
    score_prompts: s.prompts,
    score_conversation: s.conversation,
    score_settings: s.settings,
  };
}

/** A whole number 0–100, or null for anything else. */
export function parseScore(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100 ? v : null;
}

export function parseScores(v: unknown): Scores {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    pictures: parseScore(o.pictures),
    prompts: parseScore(o.prompts),
    conversation: parseScore(o.conversation),
    settings: parseScore(o.settings),
  };
}

/** Rounded average of the scored rubrics, or null if none are scored. */
export function profileScore(s: Scores): number | null {
  const vals = RUBRICS.map((r) => s[r.key]).filter((v): v is number => v !== null);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

/** Red below 50, yellow 50–80, green above 80. */
export function scoreColor(score: number): string {
  if (score > 80) return "var(--good)";
  if (score >= 50) return "var(--butter)";
  return "var(--bad)";
}

/** A short verdict for the profile score, shown next to the number. */
export function scoreVerdict(score: number): string {
  if (score > 80) return "Top tier";
  if (score >= 65) return "Solid";
  if (score >= 50) return "Average";
  return "Needs work";
}

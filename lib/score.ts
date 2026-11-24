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
  if (score > 80) return "Goated";
  if (score >= 65) return "Solid";
  if (score >= 50) return "Mid";
  return "Cooked";
}

/** Fewer reviewed profiles than this and the distribution slide isn't shown. */
export const MIN_DISTRIBUTION_SAMPLE = 5;

export type Distribution = {
  /** Estimated share of profiles that score below this one, 1–99. */
  percentile: number;
  /** The fitted bell curve at 0, 1, …, 100, scaled so the peak is 1. */
  curve: number[];
};

/** Narrowest bell we draw: a handful of similar scores would otherwise make a spike. */
const MIN_SD = 8;

/**
 * Where a score sits among the other reviewed profiles' overall scores,
 * shown as a normal distribution fitted to them (their mean and standard
 * deviation). The percentile is read off that same curve, so the shaded area
 * matches the number, and it is kept within 1–99.
 * Null when there are too few profiles to say anything.
 */
export function scoreDistribution(score: number, others: number[]): Distribution | null {
  const n = others.length;
  if (n < MIN_DISTRIBUTION_SAMPLE) return null;
  const mean = others.reduce((a, b) => a + b, 0) / n;
  const sd = Math.max(MIN_SD, Math.sqrt(others.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)));
  const z = (x: number) => (x - mean) / sd;
  return {
    percentile: Math.min(99, Math.max(1, Math.round(100 * normalCdf(z(score))))),
    curve: Array.from({ length: 101 }, (_, x) => Math.exp(-0.5 * z(x) ** 2)),
  };
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, error under 1.5e-7). */
function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

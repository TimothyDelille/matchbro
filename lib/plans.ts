/**
 * The two plans on the paywall. Amounts live in Stripe (see lib/stripe.ts,
 * `checkoutPlans()`); this file only holds the ids and the copy, so it's safe
 * to import from client components.
 */
export const PLAN_IDS = ["lifetime", "weekly"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** Price labels read from Stripe, e.g. { weekly: { price: "$7.99", intro: null }, lifetime: { price: "$49.99", sale: { price: "$34.99", percentOff: 30 } } }. */
export type Plans = {
  weekly: { price: string; /** First-week price, or null when there's no intro coupon. */ intro: string | null };
  lifetime: {
    price: string;
    /** The limited-time price, or null when there's no lifetime coupon in Stripe. Only valid until the offer ends. */
    sale: { price: string; percentOff: number } | null;
  };
};

/** How long the lifetime discount lasts, counted from when the upload started. The server enforces it at checkout. */
export const OFFER_MINUTES = 15;

/** When the lifetime discount stops for an upload started at `startedAt` (ISO). */
export function offerEndsAt(startedAt: string): string {
  return new Date(new Date(startedAt).getTime() + OFFER_MINUTES * 60_000).toISOString();
}

export const PLAN_NAMES: Record<PlanId, string> = { weekly: "Weekly", lifetime: "Lifetime" };

/** The line under a plan's name. Only say what the plan really grants. */
export const PLAN_PERKS: Partial<Record<PlanId, string>> = { lifetime: "Unlimited reviews" };

/** What a review includes, listed at the top of the paywall. */
export const REVIEW_FEATURES = ["Your score out of 100", "Picture improvements", "Prompt improvements"];

/** The plan picked when the paywall opens. */
export const DEFAULT_PLAN: PlanId = "lifetime";

export function parsePlan(value: unknown): PlanId | null {
  return PLAN_IDS.includes(value as PlanId) ? (value as PlanId) : null;
}

/** A cancellation or refund reason needs at least this many words. */
export const MIN_REASON_WORDS = 3;
export const MAX_REASON_CHARS = 1000;

export const reasonWords = (reason: string) => reason.trim().split(/\s+/).filter(Boolean).length;
export const reasonOk = (reason: string) => reasonWords(reason) >= MIN_REASON_WORDS && reason.trim().length <= MAX_REASON_CHARS;

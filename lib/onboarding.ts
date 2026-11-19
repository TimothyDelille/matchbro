/**
 * The short quiz shown between "Get My Score" and the upload step. Shared by the
 * sheet (client), the submissions API (validation) and the admin page (display).
 *
 * To drop or reorder a question, edit QUESTIONS: the progress bar, the loader
 * recap, the paywall line, validation and the admin view all follow.
 */
export type Option = {
  value: string;
  emoji: string;
  label: string;
  /** How the answer reads back to them later ("Noted: …"). */
  recap: string;
  /** Focus question only: a nudge shown on the upload step. */
  tip?: string;
};

export type Question = {
  id: "problem" | "focus" | "likes";
  /** Short name for the admin page. */
  name: string;
  title: string;
  sub?: string;
  /** "grid" lays short answers out two per row. */
  layout?: "grid";
  options: Option[];
};

export const QUESTIONS: Question[] = [
  {
    id: "problem",
    name: "Problem",
    title: "What's your biggest problem on Hinge?",
    sub: "Pick the one that hurts the most.",
    options: [
      { value: "few_likes", emoji: "😶", label: "I barely get any likes", recap: "you barely get likes" },
      { value: "wrong_likes", emoji: "👀", label: "I get likes, but not from people I'm into", recap: "your likes aren't the ones you want" },
      { value: "dead_chats", emoji: "💬", label: "I match, but conversations die fast", recap: "your conversations die fast" },
      { value: "no_dates", emoji: "📅", label: "I match, but never get dates", recap: "your matches don't turn into dates" },
      { value: "new", emoji: "🆕", label: "I'm new and want to start strong", recap: "you want to start strong" },
    ],
  },
  {
    id: "focus",
    name: "Focus",
    title: "What should we focus on?",
    sub: "We'll look at everything, and go deeper here.",
    options: [
      {
        value: "pictures",
        emoji: "📸",
        label: "My pictures: what to keep, cut and reorder",
        recap: "your pictures",
        tip: "Make sure every picture is in there.",
      },
      {
        value: "prompts",
        emoji: "✍️",
        label: "My prompts: make them easy to reply to",
        recap: "your prompts",
        tip: "Make sure your prompts are in there.",
      },
      { value: "everything", emoji: "🔥", label: "Everything: give me the full breakdown", recap: "your whole profile" },
      { value: "unsure", emoji: "🤷", label: "Not sure, tell me what hurts me most", recap: "whatever hurts you most" },
    ],
  },
  {
    id: "likes",
    name: "Likes / week",
    title: "How many likes do you get in a typical week?",
    sub: "A rough guess is fine.",
    layout: "grid",
    options: [
      { value: "0", emoji: "🥶", label: "0", recap: "0 likes a week" },
      { value: "1-3", emoji: "🙂", label: "1 to 3", recap: "1 to 3 likes a week" },
      { value: "4-10", emoji: "😎", label: "4 to 10", recap: "4 to 10 likes a week" },
      { value: "10+", emoji: "🚀", label: "More than 10", recap: "10+ likes a week" },
    ],
  },
];

/** "Where did you hear of us?", asked on /home after payment. */
export const SOURCES = [
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "reddit", label: "Reddit" },
  { value: "friend", label: "A friend" },
  { value: "google", label: "Google" },
  { value: "other", label: "Other" },
] as const;

export type Answers = Partial<Record<Question["id"], string>>;
/** What's stored in submissions.onboarding. */
export type Onboarding = Answers & { source?: string };

export const optionOf = (id: Question["id"], answers: Answers): Option | undefined =>
  QUESTIONS.find((q) => q.id === id)?.options.find((o) => o.value === answers[id]);

/** Keeps only known questions with known answers (never trust the request body). */
export function cleanAnswers(input: unknown): Answers {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Answers = {};
  for (const q of QUESTIONS) {
    if (q.options.some((o) => o.value === raw[q.id])) out[q.id] = raw[q.id] as string;
  }
  return out;
}

export const cleanSource = (input: unknown): string | null =>
  SOURCES.find((s) => s.value === input)?.value ?? null;

/** [name, answer] pairs for the admin page. */
export function describeOnboarding(input: unknown): [string, string][] {
  const answers = cleanAnswers(input);
  const rows: [string, string][] = [];
  for (const q of QUESTIONS) {
    const o = optionOf(q.id, answers);
    if (o) rows.push([q.name, o.label]);
  }
  const source = SOURCES.find((s) => s.value === (input as Onboarding | null)?.source);
  if (source) rows.push(["Heard via", source.label]);
  return rows;
}

const STORAGE_KEY = "mb_onboarding";

/** Answers survive a refresh or a closed sheet, so nobody answers twice. */
export function loadAnswers(): Answers {
  try {
    return cleanAnswers(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

export function saveAnswers(answers: Answers) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  } catch {
    // Private mode / storage full: the quiz still works for this visit.
  }
}

/** One free follow-up question per review (table public.follow_ups). Shared by client and server. */
export const MAX_QUESTION_CHARS = 2000;
export const MAX_ANSWER_CHARS = 20000;

export type FollowUp = {
  question: string;
  answer: string | null;
  created_at: string;
  answered_at: string | null;
};

export const FOLLOW_UP_COLUMNS = "question, answer, created_at, answered_at";

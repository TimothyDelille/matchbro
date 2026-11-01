// Shared by the client form and the API. The authoritative numbers live in
// the app_settings table; these mirror them for instant client-side checks.
export const MAX_FILES = 6;
export const MAX_SUBMISSION_MB = 50;
export const ACCEPTED_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
];

export const MIN_PASSWORD = 8;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Accepts most formats people type; returns E.164-ish digits with a leading + or null. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`; // assume US
  return `+${digits}`;
}

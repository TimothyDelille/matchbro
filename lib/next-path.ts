/**
 * Where to send someone after sign-in, from a `?next=` param. Only same-site
 * paths are allowed ("/reviews/…"), never "//evil.com" or full URLs, so the
 * param can't be used to bounce people to another site.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

export const signInUrl = (next: string) => `/signin?next=${encodeURIComponent(next)}`;

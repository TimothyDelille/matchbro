/**
 * The lifetime discount countdown runs once per session, not per upload:
 * - a visitor who isn't signed in (or a guest created by their upload) gets one countdown;
 * - each sign-in to a real account starts a new one, and so does signing out.
 *
 * The start time lives in a signed cookie tagged with the session it belongs to.
 * The proxy (re)issues it on the pages and API routes that show or charge the
 * paywall; everything else only reads it. Works in the proxy and in Node.
 */

export const OFFER_COOKIE = "mb_offer";

/** Where the paywall can show up or be paid: the countdown starts on the first of these. */
export const OFFER_PATHS = ["/home", "/api/submissions"];

/** "anon" for visitors and guests, otherwise the Supabase session id (new on every sign-in). */
export function offerSessionKey(accessToken: string | null | undefined, guest: boolean): string {
  if (!accessToken || guest) return "anon";
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.session_id === "string" ? payload.session_id : "anon";
  } catch {
    return "anon";
  }
}

let keyPromise: Promise<CryptoKey> | null = null;
function hmacKey() {
  keyPromise ??= crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`offer-cookie:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dev"}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return keyPromise;
}

async function sign(data: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(mac)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function makeOfferCookie(session: string, startedAt: number): Promise<string> {
  const data = `${session}~${startedAt}`;
  return `${data}~${await sign(data)}`;
}

/** The cookie's session and start time, or null if it's missing or tampered with. */
export async function readOfferCookie(value: string | undefined): Promise<{ session: string; startedAt: number } | null> {
  const parts = value?.split("~");
  if (!parts || parts.length !== 3) return null;
  const [session, started, mac] = parts;
  const startedAt = Number(started);
  if (!Number.isFinite(startedAt) || (await sign(`${session}~${started}`)) !== mac) return null;
  return { session, startedAt };
}

export const OFFER_COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365,
};

import "server-only";
import { cookies } from "next/headers";
import { OFFER_COOKIE, readOfferCookie } from "@/lib/offer-session";

/**
 * When this session's lifetime discount countdown started (ISO), or null if
 * there's none. The proxy keeps the cookie tied to the current session.
 */
export async function offerStartedAt(): Promise<string | null> {
  const cookie = await readOfferCookie((await cookies()).get(OFFER_COOKIE)?.value);
  return cookie ? new Date(cookie.startedAt).toISOString() : null;
}

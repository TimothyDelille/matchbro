/**
 * Guest accounts: visitors upload and pay before giving us an email.
 *
 * On upload, a signed-out visitor gets a normal account with a placeholder email
 * on a domain we own (never mailed: the account is created already confirmed and
 * nothing sends to it). Stripe Checkout asks for their real email, and after
 * payment it replaces the placeholder (see claimPaidEmail in lib/stripe.ts).
 * Visitors who never pay stay guests.
 */
export const GUEST_DOMAIN = "guest.matchbro.app";

export const guestEmail = (id: string) => `guest-${id}@${GUEST_DOMAIN}`;

export const isGuestEmail = (email: string | null | undefined) =>
  Boolean(email?.toLowerCase().endsWith(`@${GUEST_DOMAIN}`));

/** The email to show for an account, or null while it's still a guest. */
export const realEmail = (email: string | null | undefined) => (email && !isGuestEmail(email) ? email : null);

/** How admin pages name an account: its email, or "Guest" before they've paid. */
export const accountLabel = (email: string | null | undefined) =>
  email ? (isGuestEmail(email) ? "Guest (no email yet)" : email) : "Unknown user";

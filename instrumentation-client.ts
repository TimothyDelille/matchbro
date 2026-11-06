import posthog from "posthog-js";

// Product analytics (funnel, autocapture, replays). Vercel Analytics still handles page views.
// Events go through /ingest (rewritten in next.config.ts) so ad blockers don't drop them.
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (key) {
  try {
    posthog.init(key, {
      api_host: "/ingest",
      ui_host: "https://us.posthog.com",
      defaults: "2026-08-30",
      person_profiles: "identified_only",
    });
  } catch {
    // Analytics must never break the app.
  }
}

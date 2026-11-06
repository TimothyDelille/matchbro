"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

/**
 * Tags this visitor with the landing variant they saw. `landing_variant` is registered as a
 * PostHog super property, so later events (get_my_score_clicked, checkout, …) carry it too.
 * CTR per variant = get_my_score_clicked / landing_viewed, broken down by landing_variant.
 */
export default function LandingView({ variant }: { variant: string }) {
  useEffect(() => {
    try {
      posthog.register({ landing_variant: variant });
      posthog.capture("landing_viewed", { landing_variant: variant });
    } catch {
      // Analytics must never break the app.
    }
  }, [variant]);
  return null;
}

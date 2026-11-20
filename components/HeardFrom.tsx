"use client";

import { useState, useSyncExternalStore } from "react";
import posthog from "posthog-js";
import { SOURCES } from "@/lib/onboarding";

const ASKED_KEY = "mb_heard_from";

/** One-tap "Where did you hear of us?", shown once, right after payment. */
export default function HeardFrom() {
  const [state, setState] = useState<"ask" | "thanks" | "hidden">("ask");
  // Already answered on this device (read after hydration, so the server HTML still matches).
  const asked = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(ASKED_KEY) !== null;
      } catch {
        return false;
      }
    },
    () => false,
  );

  function answer(source: string | null) {
    try {
      localStorage.setItem(ASKED_KEY, source ?? "skipped");
      if (source) posthog.capture("heard_from", { source, $set_once: { heard_from: source } });
    } catch {
      // Analytics must never break the app.
    }
    if (!source) return setState("hidden");
    setState("thanks");
    fetch("/api/onboarding/source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    }).catch(() => {});
  }

  if (state === "hidden" || (asked && state === "ask")) return null;
  if (state === "thanks") {
    return (
      <p role="status" className="step-in mt-4 rounded-2xl border border-line px-5 py-4 font-medium">
        Thanks, that really helps 🙌
      </p>
    );
  }
  return (
    <div className="mt-4 rounded-2xl border border-line px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <p className="font-bold">One quick thing: where did you hear of us?</p>
        <button type="button" onClick={() => answer(null)} className="text-sm text-muted hover:text-ink">
          Skip
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => answer(s.value)}
            className="min-h-11 rounded-full border border-line px-4 text-sm font-semibold hover:border-ink"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

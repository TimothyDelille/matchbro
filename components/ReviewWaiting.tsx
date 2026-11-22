"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnalyzingPanel } from "@/components/DemoAnalyzing";
import HeardFrom from "@/components/HeardFrom";
import type { MediaItem } from "@/lib/report";

const POLL_MS = 3000;
/** Past this, stop the animation and fall back to "we'll email you". */
const GIVE_UP_MS = 4 * 60_000;
/** How long the bar takes to get near the end; AI reviews take ~30–90 s. */
const DURATION_MS = 45_000;

const STEPS = [
  "Scanning your pictures",
  "Checking lighting, framing and smiles",
  "Reading your prompts",
  "Comparing with 12,000+ profiles",
  "Writing your review",
];

/**
 * Shown on /reviews/[id] after payment while the review isn't published yet.
 * Polls the submission's status; once it's done, refreshes the page, which then
 * renders the review in place. With `auto` false (AI reviews off or in draft
 * mode, so a human writes it) it skips the animation and says we'll email them.
 */
export default function ReviewWaiting({
  submissionId,
  media,
  email,
  auto,
}: {
  submissionId: string;
  media: MediaItem[];
  email: string | null;
  auto: boolean;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(!auto);

  useEffect(() => {
    let stopped = false;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await fetch(`/api/submissions/${submissionId}/status`, { cache: "no-store" });
        const data = (await res.json()) as { status?: string };
        if (stopped) return;
        if (data.status === "done") {
          setReady(true);
          return;
        }
      } catch {
        // Network blip: try again next round.
      }
      if (Date.now() - started > GIVE_UP_MS) setSlow(true);
      timer = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [submissionId]);

  // Published while showing the fallback message: just load it.
  useEffect(() => {
    if (ready && slow) {
      router.replace(`/reviews/${submissionId}`);
      router.refresh();
    }
  }, [ready, slow, router, submissionId]);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 sm:px-8 pt-6 pb-16">
      {slow ? (
        <div role="status" className="mt-4 rounded-2xl bg-flame/10 px-5 py-5">
          <p className="font-bold">Payment received 🔥</p>
          <p className="mt-1">
            {auto ? "Your review is taking a little longer than usual. " : "We're on your review. "}
            We&apos;ll email {email ? <strong>{email}</strong> : "you"} as soon as it&apos;s ready, and it&apos;ll show
            up right here.
          </p>
        </div>
      ) : (
        <div className="flex justify-center pt-6">
          <AnalyzingPanel
            media={media}
            steps={STEPS}
            duration={DURATION_MS}
            ready={ready}
            doneTitle="Your review is ready 🔥"
            // Drop ?session_id so the payment isn't re-confirmed, and render the published review.
            onDone={() => {
              router.replace(`/reviews/${submissionId}`);
              router.refresh();
            }}
          />
        </div>
      )}
      <div className="mt-12">
        <HeardFrom />
      </div>
    </div>
  );
}

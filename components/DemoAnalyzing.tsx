"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MediaItem } from "@/lib/report";

const DURATION = 7200;
/** Where the bar parks while the real work behind it is still running. */
const HOLD_AT = 0.95;

const DEMO_STEPS = [
  "Scanning your pictures",
  "Checking lighting, framing and smiles",
  "Reading your prompts",
  "Comparing with 12,000+ profiles",
  "Writing your review",
];

/**
 * Progress over time with a few believable slow-downs (it "thinks" on some steps).
 * Each point is [time 0–1, progress 0–1]; segments are eased with smoothstep.
 */
const CURVE: [number, number][] = [
  [0, 0],
  [0.14, 0.17],
  [0.3, 0.24],
  [0.46, 0.47],
  [0.62, 0.58],
  [0.8, 0.79],
  [0.92, 0.94],
  [1, 1],
];

function progressAt(t: number) {
  for (let i = 1; i < CURVE.length; i++) {
    const [t1, p1] = CURVE[i];
    if (t <= t1) {
      const [t0, p0] = CURVE[i - 1];
      const x = (t - t0) / (t1 - t0);
      return p0 + (p1 - p0) * x * x * (3 - 2 * x);
    }
  }
  return 1;
}

type PanelProps = {
  media: MediaItem[];
  onDone: () => void;
  steps?: string[];
  duration?: number;
  /** While false the bar waits just short of 100% (real work is still running behind it). */
  ready?: boolean;
  eyebrow?: string;
  doneTitle?: string;
};

/** The animated "working on it" content: photo stack, headline, progress bar, checklist. */
export function AnalyzingPanel({
  media,
  onDone,
  steps = DEMO_STEPS,
  duration = DURATION,
  ready = true,
  eyebrow = "Analyzing your profile",
  doneTitle = "Your score is ready 🔥",
}: PanelProps) {
  const [progress, setProgress] = useState(0);
  const finished = useRef(false);
  const done = useRef(onDone);
  const isReady = useRef(ready);
  useEffect(() => {
    done.current = onDone;
    isReady.current = ready;
  }, [onDone, ready]);

  useEffect(() => {
    const start = performance.now();
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const waiting = t >= 1 && !isReady.current;
      setProgress(isReady.current ? progressAt(t) : Math.min(progressAt(t), HOLD_AT));
      if (t < 1 || waiting) frame = requestAnimationFrame(tick);
      else if (!finished.current) {
        finished.current = true;
        timer = setTimeout(() => done.current(), 900);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [duration]);

  const pct = Math.round(progress * 100);
  const complete = pct >= 100;
  const stepIndex = complete ? steps.length : Math.min(steps.length - 1, Math.floor(progress * steps.length));
  const thumbs = media.slice(0, 3);

  return (
    <div className="relative w-full max-w-md text-center">
      <div className="relative mx-auto h-52 w-40">
        {thumbs.length === 0 ? (
          <div className="absolute inset-0 rounded-2xl border border-line bg-line/60" />
        ) : (
          thumbs.map((m, i) => {
            const front = i === thumbs.length - 1;
            const spread = (i - (thumbs.length - 1) / 2) * 9;
            return (
              <div
                key={m.url}
                className="absolute inset-0 overflow-hidden rounded-2xl border-4 border-paper bg-line shadow-[0_18px_40px_-12px_rgb(23_18_28/0.35)]"
                style={{ transform: `rotate(${spread}deg) translateX(${spread * 2.2}px)`, zIndex: i }}
              >
                {m.kind === "video" ? (
                  <video src={m.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                )}
                {front && !complete && <span aria-hidden className="scan-line" />}
              </div>
            );
          })
        )}
        {complete && (
          <span className="pop-in absolute -right-4 -top-4 z-10 grid size-12 place-items-center rounded-full bg-good text-2xl text-paper shadow-lg">
            <Check size={24} />
          </span>
        )}
      </div>

      <p className="mt-10 text-sm font-semibold uppercase tracking-[0.14em] text-muted">
        {complete ? "Done" : eyebrow}
      </p>
      <h2
        key={stepIndex}
        aria-live="polite"
        className="step-in mt-2 min-h-[2.5em] text-2xl font-extrabold tracking-tight text-balance sm:text-3xl"
      >
        {complete ? doneTitle : `${steps[stepIndex]}…`}
      </h2>

      <div className="mt-6 flex items-baseline justify-between text-sm">
        <span className="text-muted">
          Step {Math.min(stepIndex + 1, steps.length)} of {steps.length}
        </span>
        <span className="text-2xl font-extrabold tabular-nums tracking-tight">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-2 h-3 overflow-hidden rounded-full bg-line"
      >
        <div
          className="progress-fill relative h-full rounded-full"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>

      <ul className="mt-8 space-y-3 text-left">
        {steps.map((s, i) => {
          const state = i < stepIndex ? "done" : i === stepIndex ? "active" : "todo";
          return (
            <li
              key={s}
              className={`flex items-center gap-3 transition-colors duration-300 ${state === "todo" ? "text-muted/60" : "text-ink"}`}
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-300 ${
                  state === "done" ? "bg-good text-paper" : state === "active" ? "bg-flame/15" : "bg-line"
                }`}
              >
                {state === "done" ? (
                  <Check size={14} />
                ) : state === "active" ? (
                  <span className="size-3 animate-spin rounded-full border-2 border-flame border-t-transparent" />
                ) : null}
              </span>
              <span className={state === "active" ? "font-semibold" : ""}>{s}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Demo mode: the panel as a full-screen "analyzing your profile" screen. */
export default function DemoAnalyzing(props: PanelProps) {
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Analyzing your profile"
      className="analyze-in fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-paper px-6 py-10"
    >
      {/* Soft glow behind the cards */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[28%] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--flame) 28%, transparent), transparent 70%)" }}
      />
      <AnalyzingPanel {...props} />
    </div>,
    document.body,
  );
}

function Check({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

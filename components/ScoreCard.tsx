"use client";

import { useId, useState } from "react";
import { CountUp } from "@/components/ScoreCardMotion";
import { RUBRICS, profileScore, scoreColor, scoreVerdict, type Distribution, type Scores } from "@/lib/score";

/** Width / height at or above this is a real photo; below it, a tall phone screenshot. */
const PHOTO_RATIO = 0.6;

/**
 * The user's profile score on one light card: their uploads fanned out like a
 * hand of cards, the overall score and verdict, each rubric's score, and (when
 * enough profiles have been reviewed) where they rank among everyone else.
 */
export default function ScoreCard({
  scores,
  photos = [],
  distribution = null,
}: {
  scores: Scores;
  photos?: string[];
  distribution?: Distribution | null;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const total = profileScore(scores);
  if (total === null) return null;

  const shown = photos.filter((p) => !failed.includes(p));
  const scored = RUBRICS.flatMap(({ key, label }) => {
    const s = scores[key];
    return s === null ? [] : [{ key, label, s }];
  });

  return (
    <section
      aria-labelledby="score-heading"
      className="mt-6 overflow-hidden rounded-3xl bg-cream p-4 pt-2 sm:grid sm:grid-cols-2 sm:items-center sm:gap-4 sm:p-6"
    >
      <div>
        {shown.length > 0 && (
          <div className="relative">
            <PhotoFan photos={shown} onError={(url) => setFailed((f) => [...f, url])} />
            <ScoreEmojis total={total} />
          </div>
        )}

        <div className={`text-center ${shown.length ? "" : "pt-6"}`}>
          <h2 id="score-heading" className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
            Profile score
          </h2>
          <p className="mt-2 flex items-baseline justify-center gap-1" aria-label={`${total} out of 100`}>
            <span aria-hidden className="text-[7rem] font-extrabold leading-[0.85] tracking-[-0.05em] tabular-nums">
              <CountUp value={total} />
            </span>
            <span aria-hidden className="text-base font-semibold text-muted">
              /100
            </span>
          </p>
          <span
            className={`mt-4 inline-block rounded-full px-3.5 py-1.5 text-sm font-extrabold ${total >= 50 && total <= 80 ? "text-ink" : "text-paper"}`}
            style={{ background: scoreColor(total) }}
          >
            {scoreVerdict(total)}
          </span>
        </div>
      </div>

      <div className="relative z-10 mt-6 rounded-3xl bg-paper p-5 shadow-[0_1px_2px_rgb(0_0_0/0.05)] sm:mt-0">
        <ul className="space-y-4">
          {scored.map(({ key, label, s }, i) => (
            <li key={key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{label}</span>
                <span className="text-xl font-extrabold tracking-tight tabular-nums">{s}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line">
                <div
                  className="bar-fill h-full rounded-full"
                  style={{ width: `${s}%`, background: scoreColor(s), animationDelay: `${0.3 + i * 0.12}s` }}
                />
              </div>
            </li>
          ))}
        </ul>
        {distribution && <RankBar total={total} distribution={distribution} />}
      </div>
    </section>
  );
}

/**
 * Up to six uploads fanned out like a hand of cards. The first upload sits on top
 * in the middle; the rest alternate out to either side behind it.
 */
function PhotoFan({ photos, onError }: { photos: string[]; onError: (url: string) => void }) {
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const n = photos.length;
  const spread = Math.min(56, (n - 1) * 12);
  const mid = (n - 1) / 2;
  // Slot (left to right) for each upload: first in the middle, then right, left, right…
  const centre = Math.floor(mid);
  const slotOf = [centre];
  for (let lo = centre - 1, hi = centre + 1; slotOf.length < n; ) {
    if (hi < n) slotOf.push(hi++);
    if (slotOf.length < n && lo >= 0) slotOf.push(lo--);
  }

  return (
    <div className="relative h-72 sm:origin-bottom sm:scale-[0.82]" aria-hidden>
      {photos.map((url, i) => {
        const slot = slotOf[i];
        const angle = n > 1 ? -spread / 2 + (spread * slot) / (n - 1) : 0;
        const photo = (ratios[url] ?? 0) >= PHOTO_RATIO;
        return (
          <div
            key={url}
            className="fan-in absolute bottom-8 left-1/2 aspect-[9/17] w-28 overflow-hidden rounded-xl bg-paper shadow-[0_10px_22px_-8px_rgb(23_18_28/0.35),0_0_0_1px_rgb(23_18_28/0.06)]"
            style={
              {
                "--fan": `translateX(-50%) rotate(${angle}deg)`,
                transform: "var(--fan)",
                transformOrigin: "50% 140%",
                zIndex: n - i,
                animationDelay: `${0.05 * Math.abs(slot - mid)}s`,
              } as React.CSSProperties
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
            <img
              src={url}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: photo ? "50% 25%" : "50% 0%" }}
              onLoad={(e) => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                if (h) setRatios((r) => ({ ...r, [url]: w / h }));
              }}
              onError={() => onError(url)}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Where their score sits among every other reviewed profile: a Cooked → Mid → Elite
 * bar with a faint bell curve of everyone's scores resting on it, shaded up to theirs.
 */
function RankBar({ total, distribution }: { total: number; distribution: Distribution }) {
  const id = useId();
  const H = 26;
  const TOP = 6;
  const pts = distribution.curve.map((d, x) => `${x} ${(H - d * (H - TOP)).toFixed(2)}`);
  const outline = `M${pts.join(" L")}`;
  const area = `M0 ${H} L${pts.join(" L")} L100 ${H} Z`;

  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="text-sm text-muted">
        Better than <span className="font-extrabold text-ink">{distribution.percentile}%</span> of the profiles
        we&apos;ve reviewed
      </p>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="mt-2.5 -mb-px block h-6.5 w-full" aria-hidden>
        <defs>
          <linearGradient id={`${id}-g`} x1="0" x2="1">
            <stop offset="0" stopColor="var(--bad)" />
            <stop offset="0.5" stopColor="var(--butter)" />
            <stop offset="1" stopColor="var(--good)" />
          </linearGradient>
          <clipPath id={`${id}-c`}>
            <rect x="0" y="0" width={total} height={H} />
          </clipPath>
        </defs>
        <path d={area} fill={`url(#${id}-g)`} opacity="0.14" />
        <path d={area} fill={`url(#${id}-g)`} opacity="0.38" clipPath={`url(#${id}-c)`} />
        <path
          d={outline}
          fill="none"
          stroke="var(--ink)"
          strokeOpacity="0.22"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="relative h-2.5 rounded-full bg-linear-to-r from-bad via-butter to-good">
        <span
          className="rank-in absolute top-1/2 size-5.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-ink bg-paper shadow-[0_2px_6px_rgb(0_0_0/0.2)]"
          style={{ left: `${total}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-semibold text-muted">
        <span>Cooked</span>
        <span>Mid</span>
        <span>Elite</span>
      </div>
    </div>
  );
}

/** Below "Solid" the picture gets roasted; from "Solid" up it gets hyped. */
const ROAST = ["🤡", "👉", "💀", "😬", "🫵", "🥴"];
const HYPE = ["😎", "🔥", "😏", "🤩", "💯", "😜"];

/**
 * Scattered around the fan, clear of the top card in the middle.
 * Sizes, angles, timings and wiggles are deliberately uneven so it doesn't look like a grid.
 */
const SPOTS: { at: React.CSSProperties; size: number; tilt: number; delay: number; dur: number; amp: number }[] = [
  { at: { left: "4%", top: "0%" }, size: 44, tilt: -17, delay: 0.45, dur: 1.8, amp: 12 },
  { at: { right: "6%", top: "6%" }, size: 32, tilt: 24, delay: 0.95, dur: 2.7, amp: 7 },
  { at: { left: "1%", top: "52%" }, size: 28, tilt: 8, delay: 0.7, dur: 3.3, amp: 15 },
  { at: { right: "2%", top: "46%" }, size: 46, tilt: -12, delay: 1.35, dur: 2.1, amp: 6 },
  { at: { left: "28%", top: "-3%" }, size: 24, tilt: 31, delay: 1.15, dur: 2.9, amp: 18 },
  { at: { right: "27%", top: "-4%" }, size: 28, tilt: -26, delay: 0.6, dur: 2.4, amp: 9 },
];

/** Reaction emojis around the fan: they pop in on load, then keep wiggling. */
function ScoreEmojis({ total }: { total: number }) {
  const set = total >= 65 ? HYPE : ROAST;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 select-none">
      {SPOTS.map((s, i) => (
        <span
          key={i}
          className="emoji-pop absolute leading-none drop-shadow-[0_4px_5px_rgb(0_0_0/0.25)]"
          style={{ ...s.at, fontSize: s.size, animationDelay: `${s.delay}s` }}
        >
          <span
            className="emoji-jiggle"
            style={
              {
                "--tilt": `${s.tilt}deg`,
                "--amp": `${s.amp}deg`,
                animationDelay: `${s.delay + 0.6}s`,
                animationDuration: `${s.dur}s`,
              } as React.CSSProperties
            }
          >
            {set[i]}
          </span>
        </span>
      ))}
    </div>
  );
}

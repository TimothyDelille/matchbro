"use client";

import { useId, useRef, useState } from "react";
import { CountUp, useHeroPhoto, type HeroPick } from "@/components/ScoreCardMotion";
import { RUBRICS, profileScore, scoreColor, scoreVerdict, type Distribution, type Scores } from "@/lib/score";

/**
 * The user's profile score as a swipeable rating card.
 * Slide 1: their picture with the overall score on it and each rubric's score.
 * Slide 2 (when enough profiles have been reviewed): where they sit among everyone else.
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
  // Null once we know none of their pictures can be shown: the card then drops the picture area.
  const hero = useHeroPhoto(photos);
  const track = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const total = profileScore(scores);
  if (total === null) return null;

  const hasPhoto = photos.length > 0 && hero !== null;
  const slides = distribution ? 2 : 1;

  function onScroll() {
    const el = track.current;
    if (el) setSlide(Math.round(el.scrollLeft / el.clientWidth));
  }

  function goTo(i: number) {
    const el = track.current;
    el?.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-labelledby="score-heading"
      className="mt-6 overflow-hidden rounded-3xl bg-ink text-paper"
    >
      <div
        ref={track}
        onScroll={onScroll}
        tabIndex={slides > 1 ? 0 : undefined}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-t-3xl overscroll-x-contain outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div
          role="group"
          aria-roledescription="slide"
          aria-label={`1 of ${slides}`}
          className={`w-full flex-none snap-start ${hasPhoto ? "sm:grid sm:grid-cols-2" : ""}`}
        >
          <ScoreSlide scores={scores} total={total} hero={hasPhoto ? hero : null} hasPhoto={hasPhoto} />
        </div>
        {distribution && (
          <div
            role="group"
            aria-roledescription="slide"
            aria-label={`2 of ${slides}`}
            className="flex w-full flex-none snap-start flex-col items-center justify-center px-6 py-8 text-center sm:grid sm:grid-cols-2 sm:gap-6 sm:px-8"
          >
            <CompareSlide total={total} distribution={distribution} hero={hasPhoto ? hero : null} active={slide === 1} />
          </div>
        )}
      </div>

      {slides > 1 && (
        <div className="flex justify-center gap-2 pb-5 pt-1">
          {[0, 1].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={i === 0 ? "Show your score" : "Show how you compare"}
              aria-current={slide === i}
              className={`h-2 rounded-full transition-all duration-300 ${slide === i ? "w-6 bg-paper" : "w-2 bg-paper/35 hover:bg-paper/60"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Below "Solid" the picture gets roasted; from "Solid" up it gets hyped. */
const ROAST = ["🤡", "👉", "💀", "😬", "🫵", "🥴"];
const HYPE = ["😎", "🔥", "😏", "🤩", "💯", "😜"];

/**
 * Scattered around the edges of the picture, clear of the face and of the score at the bottom.
 * Sizes, angles, timings and wiggles are deliberately uneven so it doesn't look like a grid.
 */
const SPOTS: { at: React.CSSProperties; size: number; tilt: number; delay: number; dur: number; amp: number }[] = [
  { at: { left: "4%", top: "3%" }, size: 46, tilt: -17, delay: 0.45, dur: 1.8, amp: 12 },
  { at: { right: "7%", top: "9%" }, size: 32, tilt: 24, delay: 0.95, dur: 2.7, amp: 7 },
  { at: { left: "3%", top: "30%" }, size: 27, tilt: 8, delay: 0.7, dur: 3.3, amp: 15 },
  { at: { right: "2%", top: "35%" }, size: 50, tilt: -12, delay: 1.35, dur: 2.1, amp: 6 },
  { at: { left: "25%", top: "11%" }, size: 22, tilt: 31, delay: 1.15, dur: 2.9, amp: 18 },
  { at: { left: "9%", top: "51%" }, size: 34, tilt: -26, delay: 0.6, dur: 2.4, amp: 9 },
];

/** Reaction emojis scattered over the picture: they pop in on load, then keep wiggling. */
function ScoreEmojis({ total }: { total: number }) {
  const set = total >= 65 ? HYPE : ROAST;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 select-none">
      {SPOTS.map((s, i) => (
        <span
          key={i}
          className="emoji-pop absolute leading-none drop-shadow-[0_4px_6px_rgb(0_0_0/0.35)]"
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

function ScoreSlide({
  scores,
  total,
  hero,
  hasPhoto,
}: {
  scores: Scores;
  total: number;
  hero: HeroPick | null | undefined;
  hasPhoto: boolean;
}) {
  // Rubrics that weren't part of this submission (N/A) aren't shown.
  const scored = RUBRICS.flatMap(({ key, label }) => {
    const s = scores[key];
    return s === null ? [] : [{ key, label, s }];
  });
  const color = scoreColor(total);

  return (
    <>
      <div
        className={
          hasPhoto
            ? "relative aspect-[4/5] overflow-hidden bg-linear-to-br from-muted to-ink sm:aspect-auto sm:min-h-[26rem]"
            : ""
        }
      >
        {hasPhoto && (
          <>
            <HeroImage hero={hero} className="absolute inset-0" />
            <div aria-hidden className="absolute inset-0 bg-linear-to-b from-ink/0 from-35% to-ink" />
            <ScoreEmojis total={total} />
          </>
        )}
        <div
          className={`flex items-end justify-between gap-3 px-5 ${hasPhoto ? "absolute inset-x-0 bottom-0 pb-4 sm:pb-6" : "pt-6"}`}
        >
          <div>
            <h2 id="score-heading" className="text-xs font-bold uppercase tracking-[0.14em] text-paper/70">
              Profile score
            </h2>
            <p className="mt-1 flex items-baseline gap-1.5" aria-label={`${total} out of 100`}>
              <span aria-hidden className="text-8xl font-extrabold leading-[0.85] tracking-[-0.05em] tabular-nums">
                <CountUp value={total} />
              </span>
              <span aria-hidden className="text-sm font-semibold text-paper/60">
                /100
              </span>
            </p>
          </div>
          <span
            className={`mb-1 rounded-full px-3.5 py-1.5 text-sm font-extrabold ${total >= 50 && total <= 80 ? "text-ink" : "text-paper"}`}
            style={{ background: color }}
          >
            {scoreVerdict(total)}
          </span>
        </div>
      </div>

      <ul className="flex flex-col justify-center space-y-4 p-5 sm:p-6">
        {scored.map(({ key, label, s }, i) => (
          <li key={key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-paper/80">{label}</span>
              <span className="text-2xl font-extrabold tracking-tight tabular-nums">{s}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper/15">
              <div
                className="bar-fill h-full rounded-full"
                style={{ width: `${s}%`, background: scoreColor(s), animationDelay: `${0.3 + i * 0.12}s` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Where their overall score sits on the curve of every other reviewed profile. */
function CompareSlide({
  total,
  distribution,
  hero,
  active,
}: {
  total: number;
  distribution: Distribution;
  hero: HeroPick | null | undefined;
  active: boolean;
}) {
  const id = useId();
  const W = 300;
  const TOP = 8;
  const BASE = 96;
  const x = (score: number) => (score / 100) * W;
  const y = (density: number) => BASE - density * (BASE - TOP);
  const line = distribution.curve.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d).toFixed(1)}`).join("");
  const area = `${line}L${W},${BASE}L0,${BASE}Z`;
  const you = x(total);
  // Keep the "You're here" label inside the chart at the ends.
  const labelX = Math.min(W - 34, Math.max(34, you));
  const color = scoreColor(total);

  return (
    <>
      <div className="flex flex-col items-center">
        {hero !== null && (
          <div className="size-24 overflow-hidden rounded-full bg-paper/10 ring-4 ring-paper/10">
            <HeroImage hero={hero} className="size-full" round />
          </div>
        )}
        <p className={`font-semibold text-paper/70 ${hero !== null ? "mt-4" : ""}`}>Overall</p>
        <p className="text-6xl font-extrabold leading-none tracking-[-0.04em] tabular-nums">{total}</p>
      </div>

      <div className="flex w-full flex-col items-center">
        <svg
          viewBox={`0 0 ${W} 126`}
          className="mt-6 w-full max-w-sm overflow-visible sm:mt-0"
          role="img"
          aria-label={`Your score of ${total} is higher than ${distribution.percentile}% of the profiles we've reviewed.`}
        >
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.95" />
              <stop offset="1" stopColor={color} stopOpacity="0.15" />
            </linearGradient>
            <clipPath id={`${id}-clip`}>
              {/* Sweeps in from the left each time the slide comes into view. */}
              <rect
                x="0"
                y="0"
                width={you}
                height={BASE}
                className="transition-transform duration-1000 ease-out motion-reduce:transition-none"
                style={{ transform: `scaleX(${active ? 1 : 0})`, transformOrigin: "0 0" }}
              />
            </clipPath>
          </defs>
          <path d={area} fill={`url(#${id}-fill)`} clipPath={`url(#${id}-clip)`} />
          <path d={line} fill="none" stroke="var(--paper)" strokeOpacity="0.85" strokeWidth="2" strokeLinejoin="round" />
          <line x1="0" x2={W} y1={BASE} y2={BASE} stroke="var(--paper)" strokeOpacity="0.2" />
          <path d={`M${you},${BASE + 3}l6,9h-12z`} fill="var(--paper)" />
          <text x={labelX} y={BASE + 27} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--paper)">
            You&apos;re here
          </text>
        </svg>

        <p className="mt-4 max-w-xs text-sm text-paper/70">
          Your profile scores better than <span className="font-extrabold text-paper">{distribution.percentile}%</span> of
          the profiles we&apos;ve reviewed.
        </p>
      </div>
    </>
  );
}

/**
 * The picked picture. A real photo is framed on the face; an app screenshot is
 * zoomed in on where dating apps put the main picture.
 */
function HeroImage({
  hero,
  className,
  round = false,
}: {
  hero: HeroPick | null | undefined;
  className: string;
  round?: boolean;
}) {
  const screenshot = hero?.photo === false;
  const zoom = screenshot ? (round ? "scale-[1.9]" : "scale-[1.14]") : "";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
    <img
      src={hero?.url}
      alt=""
      className={`${className} h-full w-full object-cover transition-opacity duration-700 ${hero ? "opacity-100" : "opacity-0"} ${zoom}`}
      style={{ objectPosition: screenshot ? (round ? "50% 40%" : "50% 47%") : "50% 25%" }}
    />
  );
}

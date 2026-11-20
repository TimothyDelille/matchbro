"use client";

import { CountUp, useHeroPhoto } from "@/components/ScoreCardMotion";
import { RUBRICS, profileScore, scoreColor, scoreVerdict, type Scores } from "@/lib/score";

/**
 * The user's profile score as a rating card: their picture with the overall
 * score on it, each rubric's score, and the rubric to fix first.
 */
export default function ScoreCard({ scores, photos = [] }: { scores: Scores; photos?: string[] }) {
  // Null once we know none of their pictures can be shown: the card then drops the picture area.
  const hero = useHeroPhoto(photos);
  const total = profileScore(scores);
  if (total === null) return null;
  // Rubrics that weren't part of this submission (N/A) aren't shown.
  const scored = RUBRICS.flatMap(({ key, label }) => {
    const s = scores[key];
    return s === null ? [] : [{ key, label, s }];
  });
  const worst = scored.reduce((a, b) => (b.s < a.s ? b : a));
  const best = scored.reduce((a, b) => (b.s > a.s ? b : a));
  const hasPhoto = photos.length > 0 && hero !== null;
  const color = scoreColor(total);

  return (
    <section
      aria-labelledby="score-heading"
      className={`mt-6 overflow-hidden rounded-3xl bg-ink text-paper ${hasPhoto ? "sm:grid sm:grid-cols-2" : ""}`}
    >
      <div className={hasPhoto ? "relative aspect-[4/5] overflow-hidden bg-linear-to-br from-muted to-ink sm:aspect-auto sm:min-h-[26rem]" : ""}>
        {hasPhoto && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
            <img
              src={hero?.url}
              alt=""
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${hero ? "opacity-100" : "opacity-0"} ${hero?.photo === false ? "scale-[1.14]" : ""}`}
              style={{ objectPosition: hero?.photo === false ? "50% 47%" : "50% 25%" }}
            />
            <div aria-hidden className="absolute inset-0 bg-linear-to-b from-ink/0 from-35% to-ink" />
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

      <div className="flex flex-col justify-center p-5 sm:p-6">
        <ul className="space-y-4">
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

        {scored.length > 1 && worst.s < best.s && worst.s <= 80 && (
          <p className="mt-6 rounded-2xl bg-linear-to-r from-flame-deep to-flame px-4 py-3 font-extrabold">
            Fix first: {worst.label}
            <span className="block text-sm font-medium text-paper/90">
              Your lowest score, {best.s - worst.s} points behind {best.label}.
            </span>
          </p>
        )}
      </div>
    </section>
  );
}

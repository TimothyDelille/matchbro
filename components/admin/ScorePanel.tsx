"use client";

import ScoreRing from "@/components/ScoreRing";
import { RUBRICS, profileScore, scoreColor, type RubricKey, type Scores } from "@/lib/score";

/** Rubric sliders for the reviewer, with a live preview of the profile score. */
export default function ScorePanel({
  scores,
  onChange,
  disabled,
}: {
  scores: Scores;
  onChange: (key: RubricKey, value: number | null) => void;
  disabled?: boolean;
}) {
  const total = profileScore(scores);

  return (
    <div className="mt-4 rounded-2xl border border-line p-4">
      <div className="flex items-center gap-4">
        {total === null ? (
          <div className="flex size-24 shrink-0 items-center justify-center rounded-full border-[8px] border-line text-2xl font-extrabold text-muted">
            –
          </div>
        ) : (
          <ScoreRing score={total} size={96} />
        )}
        <p className="font-semibold">Profile score</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {RUBRICS.map(({ key, label, optional }) => {
          const value = scores[key];
          const na = value === null;
          return (
            <div key={key} className="rounded-xl bg-line/40 p-3">
              <div className="flex items-baseline gap-3">
                <p className="min-w-0 flex-1 font-semibold">{label}</p>
                <span className={`text-2xl font-extrabold tracking-tight tabular-nums ${na ? "text-muted" : ""}`}>
                  {na ? (optional ? "N/A" : "–") : value}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={value ?? 50}
                  disabled={disabled || (optional && na)}
                  onChange={(e) => onChange(key, Number(e.target.value))}
                  aria-label={`${label} score`}
                  className={`h-7 w-full ${na ? "opacity-40" : ""}`}
                  style={{ accentColor: na ? "var(--muted)" : scoreColor(value) }}
                />
                {optional && (
                  <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-sm font-semibold text-muted">
                    <input
                      type="checkbox"
                      checked={na}
                      disabled={disabled}
                      onChange={(e) => onChange(key, e.target.checked ? null : 50)}
                      className="size-4 accent-ink"
                    />
                    N/A
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

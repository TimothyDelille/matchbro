import ScoreRing from "@/components/ScoreRing";
import { RUBRICS, profileScore, scoreColor, type RubricKey, type Scores } from "@/lib/score";

/** The user's profile score, with the per-rubric breakdown folded into a dropdown. */
export default function ScoreCard({ scores }: { scores: Scores }) {
  const total = profileScore(scores);
  if (total === null) return null;

  return (
    <section className="mt-8 rounded-3xl border border-line">
      <div className="flex flex-col items-center gap-4 px-5 pt-7 pb-6">
        <h2 className="font-bold">Profile score</h2>
        <ScoreRing score={total} />
      </div>

      <details className="group border-t border-line">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-b-3xl px-5 py-3 font-bold group-open:rounded-none [&::-webkit-details-marker]:hidden">
          Breakdown
          <span className="flex items-center gap-3">
            <span aria-hidden className="flex gap-1.5 group-open:hidden">
              {RUBRICS.map(({ key }) => {
                const s = scores[key];
                return (
                  <span
                    key={key}
                    className={`size-2.5 rounded-full ${s === null ? "border border-dashed border-muted" : ""}`}
                    style={s === null ? undefined : { background: scoreColor(s) }}
                  />
                );
              })}
            </span>
            <svg
              aria-hidden
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted transition-transform group-open:rotate-180"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </summary>

        <ul className="divide-y divide-line px-5 pb-2">
          {RUBRICS.map(({ key, label }) => {
            const s = scores[key];
            return (
              <li key={key} className="flex gap-3.5 py-4">
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-line/60 ${s === null ? "text-muted" : ""}`}
                >
                  <RubricIcon rubric={key} />
                </span>
                {s === null ? (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-muted">{label}</span>
                      <span className="rounded-full border border-dashed border-muted px-3 py-0.5 text-sm font-semibold text-muted">
                        N/A
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">Not scored: it wasn&apos;t in this submission.</p>
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-bold">{label}</span>
                      <span className="text-xl font-extrabold tracking-tight tabular-nums">{s}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-line/60">
                      <div className="h-full rounded-full" style={{ width: `${s}%`, background: scoreColor(s) }} />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

function RubricIcon({ rubric }: { rubric: RubricKey }) {
  const paths: Record<RubricKey, React.ReactNode> = {
    pictures: (
      <>
        <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <circle cx="12" cy="13" r="3.5" />
      </>
    ),
    prompts: (
      <>
        <path d="M7 7h10M7 12h10M7 17h6" />
        <rect x="3" y="3" width="18" height="18" rx="3" />
      </>
    ),
    conversation: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
    settings: (
      <>
        <path d="M4 6h10M18 6h2M4 18h4M12 18h8M4 12h2M10 12h10" />
        <circle cx="16" cy="6" r="2" />
        <circle cx="10" cy="18" r="2" />
        <circle cx="8" cy="12" r="2" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[rubric]}
    </svg>
  );
}

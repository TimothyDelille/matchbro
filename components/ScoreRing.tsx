import { scoreColor } from "@/lib/score";

/** Health-app style ring that closes from 0 to 100, colored by score band. */
export default function ScoreRing({ score, size = 220 }: { score: number; size?: number }) {
  const stroke = Math.round(size * 0.082);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Profile score ${score} out of 100`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          style={{ stroke: `color-mix(in srgb, ${color} 22%, white)`, transition: "stroke 300ms ease" }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          style={{ stroke: color, transition: "stroke-dashoffset 300ms ease, stroke 300ms ease" }}
        />
      </svg>
      <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-extrabold leading-none tracking-[-0.04em] tabular-nums"
          style={{ fontSize: Math.round(size * 0.34) }}
        >
          {score}
        </span>
        {size >= 140 && <span className="mt-1 text-sm text-muted">out of 100</span>}
      </div>
    </div>
  );
}

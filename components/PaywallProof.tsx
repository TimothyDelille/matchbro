import ScoreRing from "@/components/ScoreRing";

/**
 * Before / after on the paywall: the same profile with a low score and no
 * matches, then a high score and matches. The photos are an example, not a
 * customer (swap the two files in /public to change them).
 */
const BEFORE = { src: "/landing_page_bad_pic.jpeg", position: "center 35%", score: 41, matches: "0 matches" };
const AFTER = { src: "/landing_page_good_pic.jpeg", position: "center 22%", score: 89, matches: "10 matches" };

export default function PaywallProof() {
  return (
    <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <Side label="Before" {...BEFORE} />
      <span aria-hidden className="text-2xl font-extrabold text-flame">
        →
      </span>
      <Side label="After" {...AFTER} good />
    </div>
  );
}

function Side({
  label,
  src,
  position,
  score,
  matches,
  good = false,
}: {
  label: string;
  src: string;
  position: string;
  score: number;
  matches: string;
  good?: boolean;
}) {
  return (
    <figure className="relative">
      <div className={`relative aspect-[3/4] overflow-hidden rounded-2xl bg-line ${good ? "ring-2 ring-flame" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover ${good ? "" : "saturate-[0.6]"}`}
          style={{ objectPosition: position }}
        />
        <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-paper">
          {label}
        </span>
      </div>
      <span className="absolute -right-1.5 -top-2 rounded-full bg-paper p-1 shadow-[0_8px_18px_-8px_rgb(23_18_28/0.5)]">
        <ScoreRing score={score} size={52} />
      </span>
      <figcaption
        className={`absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-sm font-extrabold shadow-[0_8px_18px_-8px_rgb(23_18_28/0.5)] ${
          good ? "rotate-2 bg-flame text-paper" : "-rotate-2 bg-paper text-ink"
        }`}
      >
        {good ? "🔥 " : "💔 "}
        {matches}
      </figcaption>
    </figure>
  );
}

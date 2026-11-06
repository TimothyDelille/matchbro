import ScoreRing from "@/components/ScoreRing";

const BEFORE = 34;
const AFTER = 92;

export type LandingVariant = "guy" | "girl";

/** Only the photos (and the caption's noun) differ between variants. */
const PHOTOS: Record<
  LandingVariant,
  { before: string; beforePos: string; after: string; afterPos: string; who: string }
> = {
  guy: {
    before: "/landing_page_bad_pic.jpeg",
    beforePos: "center 35%",
    after: "/landing_page_good_pic.jpeg",
    afterPos: "center 22%",
    who: "guy",
  },
  girl: {
    before: "/landing_page_girl_bad_pic.jpeg",
    beforePos: "center 50%",
    after: "/landing_page_girl_good_pic_2.JPG",
    afterPos: "center 68%",
    who: "girl",
  },
};

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[clamp(140px,43vw,168px)] sm:w-[232px] aspect-[9/18.5] rounded-[32px] sm:rounded-[38px] bg-ink p-[6px] sm:p-[7px] shadow-[0_30px_60px_-20px_rgb(23_18_28/0.45)]">
      <div className="relative h-full rounded-[26px] sm:rounded-[31px] bg-paper overflow-hidden flex flex-col">
        <div className="mx-auto mt-2 h-[16px] w-[64px] sm:h-[18px] sm:w-[72px] rounded-full bg-ink" />
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-3 sm:px-4 pt-4">{children}</div>
      </div>
    </div>
  );
}

function Photo({ src, position = "center" }: { src: string; position?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="aspect-square w-full shrink-0 rounded-2xl object-cover"
      style={{ objectPosition: position }}
    />
  );
}

function Prompt({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2.5 sm:mt-3 shrink-0 rounded-2xl bg-white px-3 py-3 sm:px-4 sm:py-4 shadow-[0_1px_3px_rgb(23_18_28/0.1)]">
      <p className="text-[10px] sm:text-[12px] font-medium text-ink">{label}</p>
      <p className="mt-1.5 font-serif font-bold text-[14px] sm:text-[19px] leading-[1.15] text-ink">{children}</p>
    </div>
  );
}

/** Score ring sitting on the phone's corner. */
function Badge({ score, side }: { score: number; side: "left" | "right" }) {
  return (
    <div
      className={`absolute -top-5 rounded-full bg-paper p-1.5 shadow-[0_10px_24px_-8px_rgb(23_18_28/0.4)] ${
        side === "left" ? "-left-4 sm:-left-6 -rotate-[4deg]" : "-right-4 sm:-right-6 rotate-[4deg]"
      }`}
    >
      <span className="sm:hidden">
        <ScoreRing score={score} size={62} animate />
      </span>
      <span className="hidden sm:block">
        <ScoreRing score={score} size={84} animate />
      </span>
    </div>
  );
}

export default function BeforeAfter({ variant = "guy" }: { variant?: LandingVariant }) {
  const p = PHOTOS[variant];
  return (
    <figure className="select-none">
      <div className="relative h-[clamp(332px,100vw,392px)] sm:h-[520px]" aria-hidden>
        {/* Before */}
        <div className="absolute left-1/2 top-10 -translate-x-[94%] sm:-translate-x-[97%] -rotate-[6deg]">
          <Phone>
            <Photo src={p.before} position={p.beforePos} />
            <Prompt label="I'm looking for">Someone to cherish for the rest of my life</Prompt>
            <Prompt label="Pick our first date">
              Cozy café, then getting lost in a bookstore ☕📚
            </Prompt>
          </Phone>
          <Badge score={BEFORE} side="left" />
        </div>

        {/* After */}
        <div className="absolute left-1/2 top-2 -translate-x-[6%] sm:-translate-x-[3%] rotate-[4deg]">
          <Phone>
            <Photo src={p.after} position={p.afterPos} />
            <Prompt label="The key to my heart is">Open heart surgery</Prompt>
            <Prompt label="I bet you can't">Shut up.</Prompt>
          </Phone>
          <Badge score={AFTER} side="right" />
        </div>
      </div>

      <figcaption className="mt-5 sm:mt-6 text-center text-[15px] sm:text-base text-muted">
        Same {p.who}. <span className="font-bold text-ink">More likes.</span>
      </figcaption>
    </figure>
  );
}

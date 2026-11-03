function Phone({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`w-[172px] sm:w-[232px] aspect-[9/18.5] rounded-[34px] bg-ink p-[7px] shadow-[0_30px_60px_-20px_rgb(23_18_28/0.45)] ${className}`}
    >
      <div className="relative h-full rounded-[28px] bg-paper overflow-hidden flex flex-col">
        <div className="mx-auto mt-2 h-[18px] w-[72px] rounded-full bg-ink" />
        <div className="flex-1 flex flex-col px-4 pt-5 pb-4 text-[13px] leading-snug">{children}</div>
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
      className="h-24 sm:h-44 w-full shrink-0 rounded-2xl object-cover"
      style={{ objectPosition: position }}
    />
  );
}

function Prompt({ label, answer }: { label: string; answer: string }) {
  return (
    <div className="mt-3 rounded-2xl bg-white px-3 py-3 sm:px-4 sm:py-4 shadow-[0_1px_3px_rgb(23_18_28/0.08)]">
      <p className="text-[10px] sm:text-[11px] font-medium text-ink">{label}</p>
      <p className="mt-1.5 font-serif font-bold text-[14px] sm:text-[18px] leading-tight text-ink">{answer}</p>
    </div>
  );
}

function Bubble({ children, mine = false }: { children: React.ReactNode; mine?: boolean }) {
  return (
    <div
      className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] ${
        mine ? "self-end bg-ink text-paper rounded-br-md" : "self-start bg-line rounded-bl-md"
      }`}
    >
      {children}
    </div>
  );
}

function Messages({ children }: { children: React.ReactNode }) {
  return <div className="mt-auto pt-3 flex flex-col gap-1">{children}</div>;
}

export default function BeforeAfter() {
  return (
    <div className="relative flex justify-center items-end h-[380px] sm:h-[500px] select-none" aria-hidden>
      {/* Before */}
      <div className="absolute left-1/2 -translate-x-[92%] sm:-translate-x-[96%] top-8 -rotate-[7deg] opacity-90">
        <Phone>
          <Photo src="/landing_page_bad_pic_2.jpeg" position="center 35%" />
          <Prompt label="I'm looking for" answer="Someone to cherish for the rest of my life" />
          <Messages>
            <Bubble>Hey, what&apos;s up?</Bubble>
          </Messages>
        </Phone>
        <span className="absolute -top-3 -left-3 grid place-items-center h-12 w-12 rounded-full bg-line text-2xl -rotate-[8deg] shadow-lg">
          👎
        </span>
      </div>

      {/* After */}
      <div className="absolute left-1/2 -translate-x-[8%] sm:-translate-x-[4%] top-0 rotate-[4deg]">
        <Phone>
          <Photo src="/landing_page_good_pic.jpeg" position="center 22%" />
          <Prompt label="The key to my heart is" answer="Open heart surgery" />
          <Messages>
            <Bubble mine>Ok so first off</Bubble>
            <Bubble mine>you&apos;re pretty cute</Bubble>
          </Messages>
        </Phone>
        <span className="absolute -top-3 -right-3 grid place-items-center h-12 w-12 rounded-full bg-flame text-2xl rotate-[8deg] shadow-lg">
          🔥
        </span>
      </div>
    </div>
  );
}

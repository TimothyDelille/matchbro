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

function Avatar({ tone }: { tone: string }) {
  return <div className={`h-16 sm:h-24 rounded-2xl ${tone}`} aria-hidden />;
}

function Bubble({ children, mine = false }: { children: React.ReactNode; mine?: boolean }) {
  return (
    <div
      className={`mt-auto max-w-[85%] rounded-2xl px-3 py-2 text-[12px] ${
        mine ? "self-end bg-ink text-paper rounded-br-md" : "self-start bg-line rounded-bl-md"
      }`}
    >
      {children}
    </div>
  );
}

export default function BeforeAfter() {
  return (
    <div className="relative flex justify-center items-end h-[380px] sm:h-[500px] select-none" aria-hidden>
      {/* Before */}
      <div className="absolute left-1/2 -translate-x-[92%] sm:-translate-x-[96%] top-8 -rotate-[7deg] opacity-90">
        <Phone>
          <Avatar tone="bg-gradient-to-br from-zinc-200 to-zinc-300" />
          <p className="mt-3 font-semibold text-[11px] text-muted">My bio</p>
          <p className="mt-1 text-muted">
            <span className="strike">Likes pizza and travel.</span> Open to new friends.
          </p>
          <Bubble>Hey, what&apos;s up?</Bubble>
        </Phone>
      </div>

      {/* After */}
      <div className="absolute left-1/2 -translate-x-[8%] sm:-translate-x-[4%] top-0 rotate-[4deg]">
        <Phone>
          <Avatar tone="bg-gradient-to-br from-butter to-flame" />
          <p className="mt-3 font-semibold text-[11px] text-muted">My bio</p>
          <p className="mt-1 font-medium">
            Amateur chef, semi-pro sunset chaser. Tell me your worst pick-up line.
          </p>
          <Bubble mine>Okay but which sunset spot is overrated?</Bubble>
        </Phone>
        <span className="absolute -top-3 -right-3 grid place-items-center h-12 w-12 rounded-full bg-flame text-2xl rotate-[8deg] shadow-lg">
          🔥
        </span>
      </div>
    </div>
  );
}

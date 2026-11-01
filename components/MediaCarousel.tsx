"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "@/lib/report";

/**
 * Horizontal, swipeable strip of the user's screenshots and recordings.
 * Cards have a fixed height (well under a phone screen) and snap into place.
 */
export default function MediaCarousel({ items }: { items: MediaItem[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(items.length > 1);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () => {
      const cards = [...el.children] as HTMLElement[];
      const left = el.scrollLeft;
      let nearest = 0;
      cards.forEach((c, i) => {
        if (Math.abs(c.offsetLeft - el.offsetLeft - left) < Math.abs(cards[nearest].offsetLeft - el.offsetLeft - left))
          nearest = i;
      });
      const atEnd = left + el.clientWidth >= el.scrollWidth - 4;
      setIndex(atEnd ? cards.length - 1 : nearest);
      setCanPrev(left > 4);
      setCanNext(!atEnd);
      // Pause videos that have scrolled out of view.
      cards.forEach((c, i) => {
        if (i !== nearest) c.querySelector("video")?.pause();
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  function go(dir: 1 | -1) {
    const el = track.current;
    const cards = el ? ([...el.children] as HTMLElement[]) : [];
    const target = cards[Math.min(cards.length - 1, Math.max(0, index + dir))];
    if (el && target) el.scrollTo({ left: target.offsetLeft - el.offsetLeft, behavior: "smooth" });
  }

  if (!items.length) return null;

  const arrow =
    "hidden sm:grid h-10 w-10 place-items-center rounded-full border border-line bg-paper text-lg hover:border-ink disabled:opacity-30 disabled:hover:border-line";

  return (
    <section aria-label="What you sent" className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">What you sent</h2>
        <div className="flex items-center gap-2">
          {items.length > 1 && (
            <span className="text-sm text-muted tabular-nums" aria-live="polite">
              {index + 1} / {items.length}
            </span>
          )}
          <button type="button" className={arrow} onClick={() => go(-1)} disabled={!canPrev} aria-label="Previous">
            <Chevron dir="left" />
          </button>
          <button type="button" className={arrow} onClick={() => go(1)} disabled={!canNext} aria-label="Next">
            <Chevron dir="right" />
          </button>
        </div>
      </div>

      <div
        ref={track}
        tabIndex={0}
        className="mt-4 -mx-5 sm:mx-0 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 sm:scroll-px-0 px-5 sm:px-0 pb-2 outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((m) => (
          <figure
            key={m.url}
            className={`relative h-[min(52vh,440px)] aspect-[9/19] flex-none snap-start overflow-hidden rounded-2xl ${m.kind === "video" ? "bg-ink" : "bg-line"}`}
          >
            {m.kind === "video" ? (
              <video src={m.url} controls playsInline preload="metadata" className="h-full w-full object-contain" />
            ) : (
              <a href={m.url} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                <img src={m.url} alt={m.name} loading="lazy" className="h-full w-full object-contain" />
              </a>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d={dir === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MediaItem } from "@/lib/report";

/** Tracks which card of a horizontal snap track is in view, and whether it can scroll either way. */
function useTrack(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(count > 1);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const cards = [...el.children] as HTMLElement[];
    if (!cards.length) return;
    const left = el.scrollLeft;
    const dist = (c: HTMLElement) => Math.abs(c.offsetLeft - el.offsetLeft - left);
    let nearest = 0;
    cards.forEach((c, i) => {
      if (dist(c) < dist(cards[nearest])) nearest = i;
    });
    const atEnd = left + el.clientWidth >= el.scrollWidth - 4;
    setIndex(atEnd && left > 4 ? cards.length - 1 : nearest);
    setCanPrev(left > 4);
    setCanNext(!atEnd);
    // Pause videos that have scrolled out of view.
    cards.forEach((c, i) => {
      if (i !== nearest) c.querySelector("video")?.pause();
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    // Images load after the first paint and widen their cards: re-measure when any card resizes.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update, count]);

  const scrollToIndex = useCallback((i: number, behavior: ScrollBehavior = "smooth") => {
    const el = ref.current;
    const cards = el ? ([...el.children] as HTMLElement[]) : [];
    const target = cards[Math.min(cards.length - 1, Math.max(0, i))];
    if (el && target) el.scrollTo({ left: target.offsetLeft - el.offsetLeft, behavior });
  }, []);

  return { ref, index, canPrev, canNext, scrollToIndex };
}

/**
 * Horizontal, swipeable strip of the user's screenshots and recordings.
 * Cards have a fixed height (well under a phone screen) and snap into place.
 * Tapping a picture opens it full screen.
 */
export default function MediaCarousel({ items }: { items: MediaItem[] }) {
  const { ref, index, canPrev, canNext, scrollToIndex } = useTrack(items.length);
  const [open, setOpen] = useState<number | null>(null);

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
          <button type="button" className={arrow} onClick={() => scrollToIndex(index - 1)} disabled={!canPrev} aria-label="Previous">
            <Chevron dir="left" />
          </button>
          <button type="button" className={arrow} onClick={() => scrollToIndex(index + 1)} disabled={!canNext} aria-label="Next">
            <Chevron dir="right" />
          </button>
        </div>
      </div>

      <div
        ref={ref}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") scrollToIndex(index + 1);
          if (e.key === "ArrowLeft") scrollToIndex(index - 1);
        }}
        className="mt-4 -mx-5 sm:mx-0 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 sm:scroll-px-0 px-5 sm:px-0 pb-2 outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((m, i) => (
          <figure
            key={m.url}
            // Videos keep a phone-shaped frame; images take their own width so
            // photos that aren't phone-shaped don't get grey bands.
            className={`relative h-[min(52vh,440px)] flex-none snap-start overflow-hidden rounded-2xl ${m.kind === "video" ? "aspect-[9/19] bg-ink" : "min-w-24 bg-line"}`}
          >
            {m.kind === "video" ? (
              <video src={m.url} controls playsInline preload="metadata" className="h-full w-full object-contain" />
            ) : (
              <button
                type="button"
                onClick={() => setOpen(i)}
                aria-label={`View ${m.name} full screen`}
                className="block h-full cursor-zoom-in"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                <img src={m.url} alt={m.name} loading="lazy" draggable={false} className="h-full w-auto max-w-[85vw] object-cover" />
              </button>
            )}
          </figure>
        ))}
      </div>

      {open !== null && (
        <Lightbox
          items={items}
          start={open}
          onClose={(last) => {
            setOpen(null);
            scrollToIndex(last, "instant");
          }}
        />
      )}
    </section>
  );
}

/** Full-screen viewer: swipe, arrows, arrow keys, Esc or tap outside to close. */
function Lightbox({ items, start, onClose }: { items: MediaItem[]; start: number; onClose: (last: number) => void }) {
  const { ref, index, canPrev, canNext, scrollToIndex } = useTrack(items.length);
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  const close = useCallback(() => onClose(indexRef.current), [onClose]);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    scrollToIndex(start, "instant");
    closeBtn.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [start, scrollToIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") scrollToIndex(indexRef.current + 1);
      if (e.key === "ArrowLeft") scrollToIndex(indexRef.current - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, scrollToIndex]);

  const nav =
    "absolute top-1/2 hidden -translate-y-1/2 sm:grid h-12 w-12 place-items-center rounded-full bg-paper/15 text-paper backdrop-blur hover:bg-paper/30 disabled:opacity-0";

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Your pictures" className="fixed inset-0 z-50 bg-ink/95">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-3 text-paper">
        <span className="text-sm font-semibold tabular-nums">
          {items.length > 1 ? `${index + 1} / ${items.length}` : ""}
        </span>
        <button
          ref={closeBtn}
          type="button"
          onClick={close}
          aria-label="Close"
          className="grid h-10 w-10 place-items-center rounded-full bg-paper/15 text-xl hover:bg-paper/30"
        >
          ×
        </button>
      </div>

      <div
        ref={ref}
        className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((m) => (
          <div
            key={m.url}
            // Tap on the dark area around the picture closes the viewer.
            onClick={(e) => e.target === e.currentTarget && close()}
            className="flex h-full w-full min-w-0 flex-none snap-center items-center justify-center px-4 pb-6 pt-16 sm:px-20"
          >
            {m.kind === "video" ? (
              <video src={m.url} controls playsInline preload="metadata" className="max-h-full max-w-full rounded-xl" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
              <img src={m.url} alt={m.name} draggable={false} className="max-h-full max-w-full rounded-xl object-contain" />
            )}
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <>
          <button type="button" onClick={() => scrollToIndex(index - 1)} disabled={!canPrev} aria-label="Previous" className={`${nav} left-4`}>
            <Chevron dir="left" />
          </button>
          <button type="button" onClick={() => scrollToIndex(index + 1)} disabled={!canNext} aria-label="Next" className={`${nav} right-4`}>
            <Chevron dir="right" />
          </button>
        </>
      )}
    </div>,
    document.body,
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

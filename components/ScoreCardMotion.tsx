"use client";

import { useEffect, useRef, useState } from "react";

/** Width / height at or above this is a real photo; below it, a tall phone screenshot. */
const PHOTO_RATIO = 0.6;

export type HeroPick = { url: string; photo: boolean };

function measure(url: string): Promise<{ url: string; ratio: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalHeight ? { url, ratio: img.naturalWidth / img.naturalHeight } : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Picks the picture that goes behind the score. Users send a mix of app
 * screenshots and plain photos: a plain photo fills the frame best, so the
 * first one wins. With only screenshots, the first is used and cropped to where
 * dating apps put the main picture.
 * Returns undefined while loading, null if no picture could be shown.
 */
export function useHeroPhoto(urls: string[]): HeroPick | null | undefined {
  const [picked, setPicked] = useState<HeroPick | null>();
  const key = urls.join("\n");

  useEffect(() => {
    let live = true;
    Promise.all(key.split("\n").filter(Boolean).map(measure)).then((sizes) => {
      const loaded = sizes.filter((s) => s !== null);
      const photo = loaded.find((s) => s.ratio >= PHOTO_RATIO);
      const best = photo ?? loaded[0];
      if (live) setPicked(best ? { url: best.url, photo: Boolean(photo) } : null);
    });
    return () => {
      live = false;
    };
  }, [key]);

  return picked;
}

/** Counts up to the score on load. Renders the final value on the server and with reduced motion. */
export function CountUp({ value, duration = 1100 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = String(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      el.textContent = String(value);
    };
  }, [value, duration]);

  return <span ref={ref}>{value}</span>;
}

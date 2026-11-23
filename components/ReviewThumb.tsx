"use client";

import { useHeroPhoto } from "@/components/ScoreCardMotion";

/**
 * The review's cover on /home: the same picture the score card picks (a real
 * photo first, otherwise a screenshot cropped to the app's main picture).
 */
export default function ReviewThumb({ photos, className = "" }: { photos: string[]; className?: string }) {
  const hero = useHeroPhoto(photos);
  const screenshot = hero?.photo === false;
  return (
    <div className={`relative shrink-0 overflow-hidden bg-linear-to-br from-line to-muted/40 ${className}`}>
      {hero ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
        <img
          src={hero.url}
          alt=""
          className={`h-full w-full object-cover transition-opacity duration-500 ${screenshot ? "scale-[1.5]" : ""}`}
          style={{ objectPosition: screenshot ? "50% 42%" : "50% 25%" }}
        />
      ) : (
        <span aria-hidden className="absolute inset-0 grid place-items-center text-3xl">
          {hero === null ? "📱" : ""}
        </span>
      )}
    </div>
  );
}

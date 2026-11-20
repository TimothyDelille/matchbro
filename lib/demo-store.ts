"use client";

import type { MediaItem } from "@/lib/report";

/** Demo mode only: the picked files as local object URLs, for the analyzing screen. */
let items: MediaItem[] = [];

export function setDemoMedia(files: File[]) {
  items.forEach((m) => URL.revokeObjectURL(m.url));
  items = files.map((f) => ({
    url: URL.createObjectURL(f),
    name: f.name,
    kind: f.type.startsWith("video/") ? "video" : "image",
  }));
}

export function getDemoMedia(): MediaItem[] {
  return items;
}

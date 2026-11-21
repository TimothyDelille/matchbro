import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import { BUCKET, supabaseAdmin } from "@/lib/supabase/admin";

const run = promisify(execFile);

/** Longest edge sent to Claude. Tall phone screenshots stay readable at this size and cost ~1k tokens each. */
const MAX_EDGE = 1280;
/** Claude accepts up to 100 images per request; we stay well under to keep cost and latency sane. */
const MAX_IMAGES = 48;
/** One frame per second of video, minus frames that look like the previous one (no scrolling). */
const VIDEO_FPS = 1;

type MediaType = "image/jpeg" | "image/png" | "image/webp";
export type PreparedImage = { label: string; data: string; mediaType: MediaType };

/** Formats Claude reads directly, used as-is if ffmpeg can't resize them. */
const NATIVE: Record<string, MediaType> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
/** Claude's limit for one base64 image. */
const MAX_NATIVE_BYTES = 5 * 1024 * 1024;

const ffmpeg = () => process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
const isVideo = (p: string) => /\.(mp4|mov|webm|m4v)$/i.test(p);
const isHeic = (p: string, type: string) => /\.(heic|heif)$/i.test(p) || /image\/hei[cf]/i.test(type);

/** iPhone HEIC → JPEG. ffmpeg can't read HEIC (and neither can Claude), so this runs first. */
async function heicToJpeg(input: Buffer): Promise<Buffer> {
  const { default: convert } = await import("heic-convert");
  return Buffer.from(await convert({ buffer: new Uint8Array(input), format: "JPEG", quality: 0.9 }));
}
const scale = `scale='min(${MAX_EDGE},iw)':'min(${MAX_EDGE},ih)':force_original_aspect_ratio=decrease`;

/** Evenly keep `n` items, always including the first and last. */
function spread<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  if (n <= 1) return items.slice(0, n);
  return Array.from({ length: n }, (_, i) => items[Math.round((i * (items.length - 1)) / (n - 1))]);
}

async function framesFromVideo(input: string, outDir: string): Promise<string[]> {
  await run(
    ffmpeg(),
    [
      "-hide_banner", "-loglevel", "error",
      "-i", input,
      // Sample, drop near-identical frames (paused between scrolls), resize.
      "-vf", `fps=${VIDEO_FPS},mpdecimate,${scale}`,
      "-fps_mode", "vfr",
      "-q:v", "4",
      path.join(outDir, "f_%04d.jpg"),
    ],
    { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
  );
  return (await readdir(outDir)).filter((f) => f.startsWith("f_")).sort().map((f) => path.join(outDir, f));
}

async function imageToJpeg(input: string, output: string): Promise<string> {
  await run(ffmpeg(), ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-vf", scale, "-frames:v", "1", "-q:v", "3", output], {
    timeout: 60_000,
  });
  return output;
}

/**
 * Download a submission's files and turn them into JPEGs Claude can read:
 * screenshots are resized, videos become de-duplicated frames.
 * HEIC photos are converted to JPEG first. Files that still can't be decoded are
 * skipped and reported in `skipped`.
 */
export async function prepareSubmissionImages(filePaths: string[]): Promise<{ images: PreparedImage[]; skipped: string[] }> {
  const db = supabaseAdmin();
  const dir = await mkdtemp(path.join(tmpdir(), "ai-review-"));
  const skipped: string[] = [];
  // Per file: the JPEG paths to send, with labels.
  const perFile: { name: string; frames: { file: string; type: MediaType }[]; video: boolean }[] = [];

  try {
    for (const [i, storagePath] of filePaths.entries()) {
      const name = storagePath.split("/").pop()!.replace(/^\d+-/, "");
      try {
        const { data, error } = await db.storage.from(BUCKET).download(storagePath);
        if (error || !data) throw error ?? new Error("empty download");
        let bytes: Buffer = Buffer.from(await data.arrayBuffer());
        let ext = path.extname(storagePath);
        if (isHeic(storagePath, data.type)) {
          bytes = await heicToJpeg(bytes);
          ext = ".jpg";
        }
        const input = path.join(dir, `in_${i}${ext}`);
        await writeFile(input, bytes);

        if (isVideo(storagePath)) {
          const outDir = await mkdtemp(path.join(dir, `v${i}_`));
          const frames = await framesFromVideo(input, outDir);
          if (!frames.length) throw new Error("no frames");
          perFile.push({ name, frames: frames.map((file) => ({ file, type: "image/jpeg" as const })), video: true });
        } else {
          let frame: { file: string; type: MediaType };
          try {
            frame = { file: await imageToJpeg(input, path.join(dir, `img_${i}.jpg`)), type: "image/jpeg" };
          } catch (e) {
            // No ffmpeg (or it choked): send the original if Claude can read it as is.
            const type = NATIVE[ext.toLowerCase()];
            if (!type || bytes.length > MAX_NATIVE_BYTES) throw e;
            console.warn("ai review: ffmpeg failed, sending original", name, (e as Error).message);
            frame = { file: input, type };
          }
          perFile.push({ name, frames: [frame], video: false });
        }
      } catch (e) {
        console.warn("ai review: skipping file", storagePath, (e as Error).message);
        skipped.push(name);
      }
    }

    // Screenshots always go in; videos share what's left of the image budget.
    const stills = perFile.filter((f) => !f.video).length;
    const videos = perFile.filter((f) => f.video);
    const perVideo = videos.length ? Math.max(4, Math.floor((MAX_IMAGES - stills) / videos.length)) : 0;

    const images: PreparedImage[] = [];
    for (const f of perFile) {
      const frames = f.video ? spread(f.frames, perVideo) : f.frames;
      for (const [j, frame] of frames.entries()) {
        images.push({
          label: f.video ? `${f.name} (screen recording, frame ${j + 1}/${frames.length})` : `${f.name} (screenshot)`,
          data: (await readFile(frame.file)).toString("base64"),
          mediaType: frame.type,
        });
      }
    }
    return { images: images.slice(0, 100), skipped };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

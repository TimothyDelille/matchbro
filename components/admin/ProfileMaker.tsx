"use client";

import { useEffect, useRef, useState } from "react";
import { toJpeg, toPng } from "html-to-image";
import ScoreRing from "@/components/ScoreRing";

type PhotoBlock = {
  id: string;
  kind: "photo";
  src: string;
  /** object-position, in % */
  x: number;
  y: number;
  zoom: number;
  aspect: "1/1" | "4/5" | "3/4";
};
type PromptBlock = { id: string; kind: "prompt"; label: string; answer: string };
type Block = PhotoBlock | PromptBlock;

type Settings = {
  /** "screenshot" looks like an iPhone screenshot of the profile; "phone" is the landing page's phone mockup. */
  frame: "screenshot" | "phone";
  /** "screen" is one phone screen tall (scroll to pick what shows); "full" shows every block. */
  fit: "screen" | "full";
  /** How far the profile is scrolled, in px (screen-tall only). */
  scroll: number;
  /** Status bar clock. */
  time: string;
  width: number;
  tilt: number;
  badge: "none" | "left" | "right";
  score: number;
  padding: number;
  bg: "transparent" | "white" | "custom";
  bgColor: string;
  format: "png" | "jpg";
  scale: number;
  filename: string;
};

const uid = () => Math.random().toString(36).slice(2, 10);
const photo = (src = "", y = 50): PhotoBlock => ({ id: uid(), kind: "photo", src, x: 50, y, zoom: 1, aspect: "1/1" });
const prompt = (label = "", answer = ""): PromptBlock => ({ id: uid(), kind: "prompt", label, answer });

/** The landing page's four phones (components/BeforeAfter.tsx). */
const PRESETS: { name: string; blocks: () => Block[]; score: number; tilt: number; badge: Settings["badge"] }[] = [
  {
    name: "Guy · before",
    blocks: () => [
      photo("/landing_page_bad_pic.jpeg", 35),
      prompt("I'm looking for", "Someone to cherish for the rest of my life"),
      prompt("Pick our first date", "Cozy café, then getting lost in a bookstore ☕📚"),
    ],
    score: 34,
    tilt: -6,
    badge: "left",
  },
  {
    name: "Guy · after",
    blocks: () => [
      photo("/landing_page_good_pic.jpeg", 22),
      prompt("The key to my heart is", "Open heart surgery"),
      prompt("I bet you can't", "Shut up."),
    ],
    score: 92,
    tilt: 4,
    badge: "right",
  },
  {
    name: "Girl · before",
    blocks: () => [
      photo("/landing_page_girl_bad_pic.jpeg", 50),
      prompt("I'm looking for", "Someone to cherish for the rest of my life"),
      prompt("Pick our first date", "Cozy café, then getting lost in a bookstore ☕📚"),
    ],
    score: 34,
    tilt: -6,
    badge: "left",
  },
  {
    name: "Girl · after",
    blocks: () => [
      photo("/landing_page_girl_good_pic_2.JPG", 68),
      prompt("The key to my heart is", "Open heart surgery"),
      prompt("I bet you can't", "Shut up."),
    ],
    score: 92,
    tilt: 4,
    badge: "right",
  },
];

/** Hinge's prompts, by the app's categories (you can still type anything). */
const PROMPT_LABELS = [
  // About me
  "Two truths and a lie",
  "Fact about me that surprises people",
  "Believe it or not, I",
  "I'm convinced that",
  "Try to guess this about me",
  "A random fact I love is",
  "The one thing you should know about me is",
  "Dating me is like",
  "My greatest strength",
  "What if I told you that",
  "The dorkiest thing about me is",
  "Unusual skills",
  "The award I should be nominated for is",
  "My real-life superpower is",
  "Something I learned way too recently",
  "I'm the type of texter who",
  // My type
  "I want someone who",
  "Something that's non-negotiable for me is",
  "The hallmark of a good relationship is",
  "I'll brag about you to my friends if",
  "The way to win me over is",
  "I go crazy for",
  "We'll get along if",
  "I'm looking for",
  "I'll fall for you if",
  "All I ask is that you",
  "I'm weirdly attracted to",
  "The key to my heart is",
  "Green flags I look for",
  "A boundary of mine is",
  "You should not go out with me if",
  // Let's chat about
  "One thing I'd love to know about you is",
  "Let's debate about",
  "I won't shut up about",
  "I bet you can't",
  "Change my mind about",
  "Do you agree or disagree that",
  "I geek out on",
  "My most controversial opinion is",
  "A shower thought I recently had",
  "Teach me something about",
  "Let's make sure we're on the same page about",
  // Date vibes
  "Pick our first date",
  "Together, we could",
  "The best way to ask me out is by",
  "First round is on me if",
  "This year, I really want to",
  "My go-to karaoke song is",
  "After work you can find me",
  "I'm a regular at",
  "Give me travel tips for",
  "On my bucket list",
  "Before we meet, you should listen to",
  // Storytime
  "Best travel story",
  "Biggest risk I've taken",
  "Most spontaneous thing I've done",
  "Never have I ever",
  "My favorite line from a movie",
  "If loving this is wrong, I don't want to be right",
  "A life goal of mine",
  "I recently discovered that",
  "Don't hate me if I",
  "My most irrational fear",
  // Self-care
  "To me, relaxation is",
  "I get myself out of a funk by",
  "My friends ask me for advice about",
  "I wind down by",
  "My simple pleasures",
  "This week I'm grateful for",
  "My therapist would say I",
  "I feel most supported when",
  // Your world
  "My love language is",
  "How to pronounce my name",
  "Typical Sunday",
  "I'm in my element when",
  "I could stay up all night talking about",
  "The secret to getting to know me is",
  "I'm the same in real life as I am on here because",
  "We're the same type of weird if",
];

const DEFAULTS: Settings = {
  frame: "screenshot",
  fit: "screen",
  scroll: 0,
  time: "9:41",
  width: 232,
  tilt: 0,
  badge: "none",
  score: 75,
  padding: 48,
  bg: "transparent",
  bgColor: "#ffd84a",
  format: "png",
  scale: 3,
  filename: "profile",
};

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
const images = (files: FileList | null) => [...(files ?? [])].filter((f) => f.type.startsWith("image/"));

export default function ProfileMaker() {
  const [blocks, setBlocks] = useState<Block[]>(() => PRESETS[1].blocks());
  const [name, setName] = useState("");
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [maxScroll, setMaxScroll] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));
  const update = (id: string, patch: Partial<PhotoBlock> | Partial<PromptBlock>) =>
    setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));
  const remove = (id: string) => setBlocks((bs) => bs.filter((b) => b.id !== id));
  const move = (i: number, d: -1 | 1) =>
    setBlocks((bs) => {
      const j = i + d;
      if (j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function addPhotos(files: File[]) {
    const srcs = await Promise.all(files.map(readFile));
    setBlocks((bs) => [...bs, ...srcs.map((src) => photo(src))]);
  }

  function loadPreset(p: (typeof PRESETS)[number]) {
    setBlocks(p.blocks());
    setS((prev) => ({ ...prev, score: p.score, scroll: 0, tilt: p.tilt, badge: p.badge, filename: p.name.toLowerCase().replace(/\W+/g, "-") }));
  }

  const shot = s.frame === "screenshot";

  async function save() {
    const node = exportRef.current;
    if (!node) return;
    setBusy(true);
    setError(null);
    try {
      const backgroundColor = shot
        ? undefined
        : s.bg === "custom" ? s.bgColor : s.bg === "white" || s.format === "jpg" ? "#ffffff" : undefined;
      const opts = { pixelRatio: s.scale, backgroundColor, quality: 0.95 };
      const render = s.format === "png" ? toPng : toJpeg;
      // First pass warms up fonts/images (Safari often drops them on the first render).
      await render(node, opts);
      const url = await render(node, opts);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${s.filename.trim() || "profile"}.${s.format}`;
      a.click();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't render the image.");
    } finally {
      setBusy(false);
    }
  }

  const exportBg = s.bg === "custom" ? s.bgColor : s.bg === "white" ? "#ffffff" : "transparent";

  return (
    <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
      {/* Editor */}
      <div
        className="min-w-0 space-y-8"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const files = images(e.dataTransfer.files);
          if (files.length) addPhotos(files);
        }}
      >
        <Panel title="Start from the landing page">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.name} type="button" onClick={() => loadPreset(p)} className={pill}>
                {p.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setBlocks([photo(), prompt(), prompt()]);
                setS((prev) => ({ ...prev, badge: "none", tilt: 0, filename: "profile" }));
              }}
              className={pill}
            >
              Blank
            </button>
          </div>
        </Panel>

        <Panel title="Photos & prompts" hint="Drop images anywhere here to add them.">
          <label className="mb-3 block">
            <span className="text-sm font-semibold">Name</span>
            <input
              className={`${field} mt-1`}
              placeholder="Optional, shown above the first photo"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <ol className="space-y-3">
            {blocks.map((b, i) => (
              <li key={b.id} className="rounded-2xl border border-line p-4">
                <div className="flex items-center gap-2">
                  <span className="mr-auto text-sm font-semibold text-muted">
                    {b.kind === "photo" ? "📷 Photo" : "💬 Prompt"}
                  </span>
                  <button type="button" className={tool} onClick={() => move(i, -1)} disabled={i === 0} title="Move up">
                    ↑
                  </button>
                  <button
                    type="button"
                    className={tool}
                    onClick={() => move(i, 1)}
                    disabled={i === blocks.length - 1}
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button type="button" className={tool} onClick={() => remove(b.id)} title="Remove">
                    ✕
                  </button>
                </div>
                {b.kind === "photo" ? (
                  <PhotoEditor block={b} onChange={(patch) => update(b.id, patch)} />
                ) : (
                  <div className="mt-3 space-y-2">
                    <input
                      className={field}
                      list="profile-maker-labels"
                      placeholder="Prompt (e.g. I bet you can't)"
                      value={b.label}
                      onChange={(e) => update(b.id, { label: e.target.value })}
                    />
                    <textarea
                      className={`${field} min-h-20 resize-y`}
                      placeholder="Answer"
                      value={b.answer}
                      onChange={(e) => update(b.id, { answer: e.target.value })}
                    />
                  </div>
                )}
              </li>
            ))}
          </ol>
          <datalist id="profile-maker-labels">
            {PROMPT_LABELS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className={`${pill} cursor-pointer`}>
              + Photos
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  addPhotos(images(e.target.files));
                  e.target.value = "";
                }}
              />
            </label>
            <button type="button" className={pill} onClick={() => setBlocks((bs) => [...bs, prompt()])}>
              + Prompt
            </button>
          </div>
        </Panel>

        <Panel title="Look">
          <div className="grid gap-4 sm:grid-cols-2">
            <Choice
              label="Style"
              value={s.frame}
              onChange={(v) => set("frame", v)}
              options={[
                ["screenshot", "Screenshot"],
                ["phone", "Phone mockup"],
              ]}
            />
            <Choice
              label="Length"
              value={s.fit}
              onChange={(v) => set("fit", v)}
              options={[
                ["screen", "One screen"],
                ["full", "Whole profile"],
              ]}
            />
            {s.fit === "screen" && (
              <div className="sm:col-span-2">
                <Slider
                  label="Scroll"
                  unit="px"
                  value={Math.min(s.scroll, maxScroll)}
                  min={0}
                  max={Math.max(maxScroll, 1)}
                  onChange={(v) => set("scroll", v)}
                />
                <p className="mt-1 text-xs text-muted">Scroll down to show later photos, like taking a second screenshot.</p>
              </div>
            )}
            {shot ? (
              <label className="block">
                <span className="text-sm font-semibold">Clock</span>
                <input className={`${field} mt-1`} value={s.time} onChange={(e) => set("time", e.target.value)} />
              </label>
            ) : (
              <>
                <Choice
                  label="Score badge"
                  value={s.badge}
                  onChange={(v) => set("badge", v)}
                  options={[
                    ["none", "None"],
                    ["left", "Left"],
                    ["right", "Right"],
                  ]}
                />
                {s.badge !== "none" ? (
                  <Slider label="Score" value={s.score} min={0} max={100} onChange={(v) => set("score", v)} />
                ) : (
                  <div />
                )}
                <Slider label="Width" unit="px" value={s.width} min={200} max={400} onChange={(v) => set("width", v)} />
                <Slider label="Tilt" unit="°" value={s.tilt} min={-12} max={12} onChange={(v) => set("tilt", v)} />
                <Slider
                  label="Padding"
                  unit="px"
                  value={s.padding}
                  min={0}
                  max={120}
                  onChange={(v) => set("padding", v)}
                />
                <div>
                  <Choice
                    label="Background"
                    value={s.bg}
                    onChange={(v) => set("bg", v)}
                    options={[
                      ["transparent", "None"],
                      ["white", "White"],
                      ["custom", "Color"],
                    ]}
                  />
                  {s.bg === "custom" && (
                    <input
                      type="color"
                      value={s.bgColor}
                      onChange={(e) => set("bgColor", e.target.value)}
                      className="mt-2 h-9 w-full cursor-pointer rounded-lg border border-line"
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </Panel>

        <Panel title="Save">
          <div className="grid gap-4 sm:grid-cols-2">
            <Choice
              label="Format"
              value={s.format}
              onChange={(v) => set("format", v)}
              options={[
                ["png", "PNG"],
                ["jpg", "JPG"],
              ]}
            />
            <Choice
              label="Resolution"
              value={String(s.scale) as "2" | "3" | "4"}
              onChange={(v) => set("scale", Number(v))}
              options={[
                ["2", "2×"],
                ["3", "3×"],
                ["4", "4×"],
              ]}
            />
            <label className="block sm:col-span-2">
              <span className="text-sm font-semibold">File name</span>
              <input className={`${field} mt-1`} value={s.filename} onChange={(e) => set("filename", e.target.value)} />
            </label>
          </div>
          {!shot && s.format === "jpg" && s.bg === "transparent" && (
            <p className="mt-3 text-sm text-muted">JPG has no transparency, so the background will be white.</p>
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="mt-4 w-full rounded-full bg-flame px-6 py-3 font-bold text-paper hover:bg-flame-deep disabled:opacity-50"
          >
            {busy ? "Rendering…" : `Save ${s.format.toUpperCase()}`}
          </button>
          {error && <p className="mt-3 text-sm text-bad">{error}</p>}
        </Panel>
      </div>

      {/* Preview */}
      <div className="min-w-0 lg:sticky lg:top-6">
        <div
          className="overflow-auto rounded-3xl border border-line p-6 flex justify-center"
          style={
            !shot && s.bg === "transparent"
              ? {
                  backgroundImage:
                    "linear-gradient(45deg,#f3f1f5 25%,transparent 25%),linear-gradient(-45deg,#f3f1f5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f3f1f5 75%),linear-gradient(-45deg,transparent 75%,#f3f1f5 75%)",
                  backgroundSize: "20px 20px",
                  backgroundPosition: "0 0,0 10px,10px -10px,-10px 0",
                }
              : undefined
          }
        >
          {/* Everything inside this box is what gets saved. */}
          <div
            ref={exportRef}
            className="inline-block shrink-0"
            style={shot ? undefined : { padding: s.padding, background: exportBg }}
          >
            <Profile name={name} blocks={blocks} s={s} onMaxScroll={setMaxScroll} />
          </div>
        </div>
        <p className="mt-3 text-center text-sm text-muted">
          {shot && s.scale === 3
            ? "Saves at 1179 × 2556 when one screen tall, the size of an iPhone 15/16 Pro screenshot."
            : "What you see in the box is what gets saved."}
        </p>
      </div>
    </div>
  );
}

/* ---------- The profile itself ---------- */

type ProfileProps = { name: string; blocks: Block[]; s: Settings; onMaxScroll: (px: number) => void };

function Profile(props: ProfileProps) {
  return props.s.frame === "screenshot" ? <Screenshot {...props} /> : <PhoneMockup {...props} />;
}

/** Reports how far the content can scroll inside its viewport (updates as images load). */
function useMaxScroll(onMaxScroll: (px: number) => void) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const v = viewport.current;
    const c = content.current;
    if (!v || !c) return;
    const measure = () => onMaxScroll(Math.max(0, Math.ceil(c.offsetHeight - v.clientHeight)));
    const ro = new ResizeObserver(measure);
    ro.observe(v);
    ro.observe(c);
    measure();
    return () => ro.disconnect();
  }, [onMaxScroll]);
  return { viewport, content };
}

const IOS_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif';

/** An iPhone screenshot of the profile: status bar, name header, then photos and prompts on grey. */
function Screenshot({ name, blocks, s, onMaxScroll }: ProfileProps) {
  const { viewport, content } = useMaxScroll(onMaxScroll);
  const screen = s.fit === "screen";
  return (
    <div
      className="relative flex flex-col overflow-hidden bg-[#f2f2f4] text-black"
      style={{ width: 393, height: screen ? 852 : undefined, fontFamily: IOS_FONT }}
    >
      <div className="relative z-10 shrink-0 bg-[#fafafa] border-b border-black/[0.08]">
        <StatusBar time={s.time} />
        <p className="truncate px-16 pt-1 pb-3.5 text-center text-[22px] font-semibold leading-[1.2] tracking-[-0.01em]">
          {name.trim() || "\u00a0"}
        </p>
      </div>
      <div ref={viewport} className={screen ? "flex-1 min-h-0 overflow-hidden" : ""}>
        <div
          ref={content}
          className="flex flex-col gap-5 px-5 pt-4 pb-10"
          style={screen && s.scroll ? { transform: `translateY(-${s.scroll}px)` } : undefined}
        >
          {blocks.map((b) =>
            b.kind === "photo" ? (
              <PreviewPhoto key={b.id} b={b} radius={12} />
            ) : (
              <div key={b.id} className="shrink-0 rounded-[12px] bg-white px-6 pt-7 pb-9">
                <p className="text-[15px] font-semibold">{b.label || "Prompt"}</p>
                <p className="mt-3 whitespace-pre-line font-serif text-[28px] font-bold leading-[1.15]">
                  {b.answer || "Your answer"}
                </p>
              </div>
            ),
          )}
        </div>
      </div>
      {/* Home indicator */}
      <div className="absolute bottom-2 left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-black" />
    </div>
  );
}

function StatusBar({ time }: { time: string }) {
  return (
    <div className="flex h-[54px] items-center justify-between pl-[42px] pr-[30px] pt-1.5">
      <span className="text-[17px] font-semibold tracking-[-0.01em]">{time}</span>
      <span className="flex items-center gap-[6px]">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden>
          <rect x="0" y="7.5" width="3" height="4.5" rx="1" />
          <rect x="5" y="5" width="3" height="7" rx="1" />
          <rect x="10" y="2.5" width="3" height="9.5" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden>
          <path d="M8 11.6 5.7 9.3a3.3 3.3 0 0 1 4.6 0Z" />
          <path d="M3.6 7.2a6.2 6.2 0 0 1 8.8 0l-1.3 1.3a4.4 4.4 0 0 0-6.2 0Z" />
          <path d="M1.1 4.7a9.8 9.8 0 0 1 13.8 0l-1.3 1.3a8 8 0 0 0-11.2 0Z" />
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden>
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" opacity="0.35" />
          <rect x="2" y="2" width="17" height="9" rx="2.3" fill="currentColor" />
          <path d="M25 4.5v4a2.2 2.2 0 0 0 0-4Z" fill="currentColor" opacity="0.4" />
        </svg>
      </span>
    </div>
  );
}

/** The landing page's phone mockup (components/BeforeAfter.tsx at desktop size). */
function PhoneMockup({ name, blocks, s, onMaxScroll }: ProfileProps) {
  const { viewport, content } = useMaxScroll(onMaxScroll);
  const k = s.width / 232; // landing phone width
  const screen = s.fit === "screen";

  return (
    <div className="relative" style={{ width: s.width, transform: s.tilt ? `rotate(${s.tilt}deg)` : undefined }}>
      <div
        className="rounded-[38px] bg-ink p-[7px] shadow-[0_30px_60px_-20px_rgb(23_18_28/0.45)]"
        style={screen ? { aspectRatio: "9 / 18.5" } : undefined}
      >
        <div className={`relative rounded-[31px] bg-paper overflow-hidden flex flex-col ${screen ? "h-full" : ""}`}>
          <div className="mx-auto mt-2 h-[18px] w-[72px] shrink-0 rounded-full bg-ink" />
          {name.trim() && (
            <p className="shrink-0 truncate px-4 pt-2 text-center text-[15px] font-semibold">{name.trim()}</p>
          )}
          <div ref={viewport} className={screen ? "flex-1 min-h-0 overflow-hidden" : ""}>
            <div
              ref={content}
              className="flex flex-col gap-3 px-4 pt-3 pb-4"
              style={screen && s.scroll ? { transform: `translateY(-${s.scroll}px)` } : undefined}
            >
              {blocks.map((b) =>
                b.kind === "photo" ? <PreviewPhoto key={b.id} b={b} radius={16} /> : <PreviewPrompt key={b.id} b={b} />,
              )}
            </div>
          </div>
        </div>
      </div>
      {s.badge !== "none" && (
        <div
          className={`absolute rounded-full bg-paper p-1.5 shadow-[0_10px_24px_-8px_rgb(23_18_28/0.4)] ${
            s.badge === "left" ? "-rotate-[4deg]" : "rotate-[4deg]"
          }`}
          style={{ top: -20 * k, [s.badge]: -24 * k }}
        >
          <ScoreRing score={s.score} size={Math.round(84 * k)} />
        </div>
      )}
    </div>
  );
}

function PreviewPhoto({ b, radius }: { b: PhotoBlock; radius: number }) {
  return (
    <div className="w-full shrink-0 overflow-hidden bg-line" style={{ aspectRatio: b.aspect, borderRadius: radius }}>
      {b.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={b.src}
          alt=""
          className="h-full w-full object-cover"
          style={{
            objectPosition: `${b.x}% ${b.y}%`,
            transform: b.zoom !== 1 ? `scale(${b.zoom})` : undefined,
            transformOrigin: `${b.x}% ${b.y}%`,
          }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted">No photo</div>
      )}
    </div>
  );
}

function PreviewPrompt({ b }: { b: PromptBlock }) {
  return (
    <div className="shrink-0 rounded-2xl bg-white px-4 py-4 shadow-[0_1px_3px_rgb(23_18_28/0.1)]">
      <p className="text-[12px] font-medium text-ink">{b.label || "Prompt"}</p>
      <p className="mt-1.5 whitespace-pre-line font-serif font-bold text-[19px] leading-[1.15] text-ink">
        {b.answer || "Your answer"}
      </p>
    </div>
  );
}

/* ---------- Editor bits ---------- */

const pill = "rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-ink";
const tool =
  "rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted hover:bg-line hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";
const field = "w-full rounded-xl border border-line px-3 py-2 outline-none focus:border-ink";

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PhotoEditor({ block: b, onChange }: { block: PhotoBlock; onChange: (p: Partial<PhotoBlock>) => void }) {
  return (
    <div className="mt-3 grid grid-cols-[5rem_1fr] gap-4">
      <label className="relative block h-20 w-20 cursor-pointer overflow-hidden rounded-xl bg-line" title="Choose image">
        {b.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-xs font-semibold text-muted">Choose</span>
        )}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={async (e) => {
            const f = images(e.target.files)[0];
            if (f) onChange({ src: await readFile(f), x: 50, y: 50, zoom: 1 });
            e.target.value = "";
          }}
        />
      </label>
      <div className="space-y-2">
        <Choice
          label="Shape"
          value={b.aspect}
          onChange={(v) => onChange({ aspect: v })}
          options={[
            ["1/1", "Square"],
            ["4/5", "4:5"],
            ["3/4", "3:4"],
          ]}
        />
        <Slider label="Horizontal" unit="%" value={b.x} min={0} max={100} onChange={(v) => onChange({ x: v })} />
        <Slider label="Vertical" unit="%" value={b.y} min={0} max={100} onChange={(v) => onChange({ y: v })} />
        <Slider
          label="Zoom"
          unit="×"
          value={b.zoom}
          min={1}
          max={3}
          step={0.05}
          onChange={(v) => onChange({ zoom: v })}
        />
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-muted">
          {step < 1 ? value.toFixed(2) : value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-flame"
      />
    </label>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <span className="text-sm font-semibold">{label}</span>
      <div className="mt-1 flex rounded-full bg-line p-1">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold ${
              v === value ? "bg-paper text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Markdown from "@/components/Markdown";
import VoiceRecorder from "@/components/admin/VoiceRecorder";
import ScorePanel from "@/components/admin/ScorePanel";
import type { RubricKey, Scores } from "@/lib/score";
import { readJson, uploadToSignedUrl } from "@/lib/upload";

type Initial = {
  markdown: string;
  audioPath: string | null;
  scores: Scores;
  publishedAt: string | null;
  updatedAt: string | null;
};

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

const STARTER = `## What's working

## Photos

## Prompts

## Conversations

## Try this next
`;

export default function ReportEditor({
  submissionId,
  initial,
  assets: initialAssets,
}: {
  submissionId: string;
  initial: Initial;
  assets: Record<string, string>;
}) {
  const router = useRouter();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [markdown, setMarkdown] = useState(initial.markdown || STARTER);
  const [audioPath, setAudioPath] = useState<string | null>(initial.audioPath);
  const [scores, setScores] = useState<Scores>(initial.scores);
  const [assets, setAssets] = useState(initialAssets);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [publishedAt, setPublishedAt] = useState(initial.publishedAt);
  const [savedAt, setSavedAt] = useState<string | null>(initial.updatedAt);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // what we're doing right now
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const published = Boolean(publishedAt);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function setScore(key: RubricKey, value: number | null) {
    setScores((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }

  function edit(next: string) {
    setMarkdown(next);
    setDirty(true);
  }

  /** Upload one image/audio file into this submission's report folder. Returns its short path. */
  async function uploadAsset(file: File): Promise<string> {
    const type = file.type.split(";")[0];
    const res = await fetch(`/api/admin/submissions/${submissionId}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, type, size: file.size }),
    });
    const data = await readJson<{ path: string; shortPath: string; token: string }>(res);
    if (!res.ok) throw new Error(data.error);
    const upload = type === file.type ? file : new File([file], file.name, { type });
    await uploadToSignedUrl(data.path, data.token, upload);
    setAssets((a) => ({ ...a, [data.shortPath]: URL.createObjectURL(file) }));
    return data.shortPath;
  }

  function insertAtCursor(text: string) {
    const el = textarea.current;
    // Insert at the cursor if you were typing, otherwise at the end.
    const focused = el && document.activeElement === el;
    const start = focused ? el.selectionStart : markdown.length;
    const end = focused ? el.selectionEnd : markdown.length;
    const next = markdown.slice(0, start) + text + markdown.slice(end);
    edit(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  }

  function wrap(before: string, after = before, placeholder = "text") {
    const el = textarea.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = markdown.slice(s, e) || placeholder;
    edit(markdown.slice(0, s) + before + selected + after + markdown.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  }

  function prefixLines(prefix: string) {
    const el = textarea.current;
    if (!el) return;
    const s = markdown.lastIndexOf("\n", el.selectionStart - 1) + 1;
    const e = el.selectionEnd;
    const block = markdown
      .slice(s, e)
      .split("\n")
      .map((l) => prefix + l)
      .join("\n");
    edit(markdown.slice(0, s) + block + markdown.slice(e));
  }

  async function addImages(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setError(null);
    setBusy(images.length > 1 ? `Uploading ${images.length} images…` : "Uploading image…");
    try {
      const lines: string[] = [];
      for (const f of images) {
        const path = await uploadAsset(f);
        lines.push(`![${f.name.replace(/\.[^.]+$/, "")}](${path})`);
      }
      insertAtCursor(`\n${lines.join("\n\n")}\n`);
    } catch (e) {
      setError(e instanceof Error && e.message !== "network" ? e.message : "Image upload failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function setAudio(file: File) {
    setError(null);
    setBusy("Uploading voice note…");
    try {
      const path = await uploadAsset(file);
      setAudioPath(path);
      setDirty(true);
    } catch (e) {
      setError(e instanceof Error && e.message !== "network" ? e.message : "Audio upload failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const save = useCallback(
    async (publish: boolean) => {
      setError(null);
      setConfirming(false);
      setBusy(publish ? (published ? "Saving…" : "Publishing…") : "Saving…");
      try {
        const res = await fetch(`/api/admin/submissions/${submissionId}/report`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown, audioPath, scores, publish }),
        });
        const data = await readJson<{ publishedAt: string | null; savedAt: string }>(res);
        if (!res.ok) throw new Error(data.error);
        setPublishedAt(data.publishedAt);
        setSavedAt(data.savedAt);
        setDirty(false);
        if (publish) router.refresh();
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : "Couldn't save. Try again.");
      } finally {
        setBusy(null);
      }
    },
    [submissionId, markdown, audioPath, scores, published, router],
  );

  // Cmd/Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!busy) save(published);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, busy, published]);

  const tool = "rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted hover:bg-line hover:text-ink";

  return (
    <section className="min-w-0">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-bold">Their review</h2>
        <span className="text-sm text-muted">
          {published ? "Published" : "Draft"}
          {savedAt && !dirty && ` · saved ${timeFmt.format(new Date(savedAt))}`}
          {dirty && " · unsaved changes"}
        </span>
      </div>

      <ScorePanel scores={scores} onChange={setScore} disabled={Boolean(busy)} />

      {/* Voice walkthrough */}
      <div className="mt-4 rounded-2xl border border-line p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="mr-auto font-semibold">Voice walkthrough</span>
          <VoiceRecorder onRecorded={setAudio} disabled={Boolean(busy)} />
          <label className="cursor-pointer rounded-full border border-line px-5 py-2.5 font-semibold hover:border-ink">
            Upload audio
            <input
              type="file"
              accept="audio/*"
              className="sr-only"
              disabled={Boolean(busy)}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) setAudio(f);
              }}
            />
          </label>
        </div>
        {audioPath && assets[audioPath] && (
          <div className="mt-4 flex items-center gap-3">
            <audio key={audioPath} src={assets[audioPath]} controls className="w-full" />
            <button
              type="button"
              onClick={() => {
                setAudioPath(null);
                setDirty(true);
              }}
              className="shrink-0 text-sm text-muted hover:text-flame-deep"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {/* Markdown */}
      <div className="mt-4 rounded-2xl border border-line">
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5">
          <div className="mr-2 flex rounded-lg bg-line/60 p-0.5">
            {(["write", "preview"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 text-sm font-semibold capitalize ${
                  tab === t ? "bg-paper shadow-sm" : "text-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "write" && (
            <>
              <button type="button" className={tool} onClick={() => wrap("**")} title="Bold">
                B
              </button>
              <button type="button" className={`${tool} italic`} onClick={() => wrap("_")} title="Italic">
                I
              </button>
              <button type="button" className={tool} onClick={() => prefixLines("## ")} title="Heading">
                H
              </button>
              <button type="button" className={tool} onClick={() => prefixLines("- ")} title="Bulleted list">
                List
              </button>
              <button type="button" className={tool} onClick={() => prefixLines("> ")} title="Quote">
                Quote
              </button>
              <label className={`${tool} cursor-pointer`} title="Add images (or paste / drop them)">
                Image
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  disabled={Boolean(busy)}
                  onChange={(e) => {
                    const fs = [...(e.target.files ?? [])];
                    e.target.value = "";
                    addImages(fs);
                  }}
                />
              </label>
            </>
          )}
        </div>

        {tab === "write" ? (
          <textarea
            ref={textarea}
            value={markdown}
            onChange={(e) => edit(e.target.value)}
            onPaste={(e) => {
              const fs = [...e.clipboardData.files];
              if (fs.some((f) => f.type.startsWith("image/"))) {
                e.preventDefault();
                addImages(fs);
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const fs = [...e.dataTransfer.files];
              if (fs.length) {
                e.preventDefault();
                addImages(fs);
              }
            }}
            spellCheck
            aria-label="Report"
            className="block min-h-[60vh] w-full resize-y rounded-b-2xl bg-paper p-4 font-mono text-[15px] leading-relaxed outline-none"
          />
        ) : (
          <div className="min-h-[60vh] p-5">
            {markdown.trim() ? <Markdown markdown={markdown} assets={assets} /> : <p className="text-muted">Nothing written yet.</p>}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center gap-3 border-t border-line bg-paper/95 py-4 backdrop-blur">
        {error && (
          <p role="alert" className="w-full text-sm text-flame-deep">
            {error}
          </p>
        )}
        {busy && <p className="w-full text-sm text-muted">{busy}</p>}

        {published ? (
          <>
            <button
              type="button"
              onClick={() => save(true)}
              disabled={Boolean(busy) || !dirty}
              className="rounded-full bg-flame px-6 py-3 font-bold text-paper hover:bg-flame-deep disabled:opacity-50"
            >
              Save changes
            </button>
            <Link href={`/reviews/${submissionId}`} className="font-semibold text-muted hover:text-ink" target="_blank">
              View as user
            </Link>
            <span className="ml-auto text-sm text-muted">Changes go live for the user as soon as you save.</span>
          </>
        ) : confirming ? (
          <>
            <span className="font-semibold">Send this review to the user?</span>
            <button
              type="button"
              onClick={() => save(true)}
              disabled={Boolean(busy)}
              className="rounded-full bg-flame px-6 py-3 font-bold text-paper hover:bg-flame-deep disabled:opacity-50"
            >
              Yes, publish
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="font-semibold text-muted hover:text-ink">
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => save(false)}
              disabled={Boolean(busy)}
              className="rounded-full border border-line px-6 py-3 font-bold hover:border-ink disabled:opacity-50"
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={Boolean(busy)}
              className="rounded-full bg-flame px-6 py-3 font-bold text-paper hover:bg-flame-deep disabled:opacity-50"
            >
              Publish
            </button>
          </>
        )}
      </div>
    </section>
  );
}

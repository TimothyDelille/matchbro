"use client";

import { useEffect, useRef, useState } from "react";

const TYPES = [
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/mp4", ext: "m4a" },
  { mime: "audio/webm", ext: "webm" },
];

function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Records from the mic and hands back a File when stopped. */
export default function VoiceRecorder({
  onRecorded,
  disabled,
}: {
  onRecorded: (file: File) => void;
  disabled?: boolean;
}) {
  const recorder = useRef<MediaRecorder | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (startedAt == null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [startedAt]);

  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  async function start() {
    setError(null);
    if (typeof MediaRecorder === "undefined") return setError("This browser can't record audio.");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setError("Allow microphone access in your browser to record.");
    }
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t.mime)) ?? TYPES[2];
    const rec = new MediaRecorder(stream, { mimeType: type.mime });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const base = type.mime.split(";")[0];
      const file = new File(chunks, `voice-walkthrough.${type.ext}`, { type: base });
      setStartedAt(null);
      if (file.size) onRecorded(file);
    };
    rec.start(1000);
    recorder.current = rec;
    setStartedAt(Date.now());
    setNow(Date.now());
  }

  function stop() {
    recorder.current?.stop();
    recorder.current = null;
  }

  return (
    <div className="inline-flex flex-col">
      {startedAt == null ? (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-semibold text-paper hover:bg-ink/85 disabled:opacity-50"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-flame" aria-hidden />
          Record
        </button>
      ) : (
        <button
          type="button"
          onClick={stop}
          className="inline-flex items-center gap-2 rounded-full bg-flame px-5 py-2.5 font-semibold text-paper"
        >
          <span className="h-2.5 w-2.5 rounded-sm bg-paper motion-safe:animate-pulse" aria-hidden />
          Stop <span className="tabular-nums">{clock(now - startedAt)}</span>
        </button>
      )}
      {error && (
        <span role="alert" className="mt-2 text-sm text-flame-deep">
          {error}
        </span>
      )}
    </div>
  );
}

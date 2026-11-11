"use client";

import { useState } from "react";
import Markdown from "@/components/Markdown";
import { readJson } from "@/lib/upload";
import { MAX_ANSWER_CHARS, type FollowUp } from "@/lib/follow-up";

const when = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" });

/** The user's free follow-up question, and the box to answer it. Saving sends the answer to them. */
export default function FollowUpAnswer({ submissionId, initial }: { submissionId: string; initial: FollowUp }) {
  const [followUp, setFollowUp] = useState(initial);
  const [answer, setAnswer] = useState(initial.answer ?? "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answered = Boolean(followUp.answered_at);
  const dirty = answer.trim() !== (followUp.answer ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/submissions/${submissionId}/follow-up`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    });
    const data = await readJson<{ followUp?: FollowUp }>(res);
    setBusy(false);
    if (res.ok && data.followUp) {
      setFollowUp(data.followUp);
      setAnswer(data.followUp.answer ?? "");
    } else {
      setError(data.error ?? "Couldn't save the answer. Try again.");
    }
  }

  return (
    <section
      id="follow-up"
      className={`rounded-3xl border p-5 ${answered ? "border-line" : "border-flame bg-flame/5"}`}
      aria-labelledby="follow-up-heading"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="follow-up-heading" className="font-bold">
          {answered ? "Follow-up question" : "💬 Follow-up question to answer"}
        </h2>
        <span className="text-sm text-muted">Asked {when.format(new Date(followUp.created_at))}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-paper px-4 py-3 border border-line">{followUp.question}</p>

      <div className="mt-4 flex gap-1 text-sm font-semibold">
        {(["write", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 capitalize ${tab === t ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "write" ? (
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          maxLength={MAX_ANSWER_CHARS}
          rows={6}
          placeholder="Your answer (markdown works)"
          className="mt-2 w-full resize-y rounded-2xl border border-line bg-paper px-4 py-3 font-mono text-sm outline-none focus:border-ink"
        />
      ) : (
        <div className="mt-2 min-h-32 rounded-2xl border border-line bg-paper p-4">
          {answer.trim() ? <Markdown markdown={answer} /> : <p className="text-muted">Nothing written yet.</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy || !answer.trim() || !dirty}
          className="rounded-full bg-flame px-5 py-2.5 font-bold text-paper hover:bg-flame-deep disabled:opacity-50"
        >
          {busy ? "Saving…" : answered ? "Save changes" : "Send answer"}
        </button>
        <span className="text-sm text-muted">
          {answered
            ? `Answered ${when.format(new Date(followUp.answered_at!))}. Changes go live when you save.`
            : "They'll see it on their review page as soon as you send it."}
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-flame-deep">
          {error}
        </p>
      )}
    </section>
  );
}

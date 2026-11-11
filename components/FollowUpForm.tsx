"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readJson } from "@/lib/upload";
import { MAX_QUESTION_CHARS } from "@/lib/follow-up";

/** The box where the owner asks their one free follow-up question. */
export default function FollowUpForm({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = MAX_QUESTION_CHARS - question.length;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/submissions/${submissionId}/follow-up`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await readJson<{ followUp?: unknown }>(res);
    if (res.ok) {
      router.refresh();
      return;
    }
    setBusy(false);
    setError(data.error ?? "Couldn't send your question. Try again.");
  }

  return (
    <form onSubmit={send} className="mt-5">
      <label htmlFor="follow-up" className="sr-only">
        Your follow-up question
      </label>
      <textarea
        id="follow-up"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        maxLength={MAX_QUESTION_CHARS}
        rows={4}
        placeholder="e.g. Which photo should I lead with if I drop the group shot?"
        className="w-full resize-y rounded-2xl border border-line bg-paper px-4 py-3 text-base outline-none placeholder:text-muted/70 focus:border-ink"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className={`text-sm ${left < 100 ? "text-flame-deep" : "text-muted"}`}>
          {left < 300 ? `${left} characters left · ` : ""}You get one, so make it count.
        </span>
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="rounded-full bg-ink px-6 py-3 font-bold text-paper hover:bg-flame disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send my question"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-flame-deep">
          {error}
        </p>
      )}
    </form>
  );
}

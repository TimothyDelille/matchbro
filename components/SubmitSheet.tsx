"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { readJson, uploadToSignedUrl } from "@/lib/upload";
import { ACCEPTED_TYPES, EMAIL_RE, MAX_FILES, MAX_SUBMISSION_MB } from "@/lib/limits";
import { QUESTIONS, loadAnswers, optionOf, saveAnswers, type Answers, type Question } from "@/lib/onboarding";
import { LOCKED_PREVIEW } from "@/lib/locked-preview";
import type { MediaItem } from "@/lib/report";
import { getDemoMedia, setDemoMedia } from "@/lib/demo-store";
import DemoAnalyzing, { AnalyzingPanel } from "@/components/DemoAnalyzing";

/** A picked file plus a local preview URL. */
type Item = { file: File; url: string; kind: MediaItem["kind"] };

/** What the sheet is showing. Quiz questions come first (landing page only), then the upload. */
type View =
  | { kind: "question"; index: number }
  | { kind: "upload" }
  /** "Preparing your review" loader; the real upload runs behind it. */
  | { kind: "preparing" }
  | { kind: "paywall"; checkoutUrl: string; priceLabel: string | null };

/** How the upload ended, read when the loader finishes. */
type Outcome = { checkoutUrl?: string; priceLabel?: string | null };

type Props = {
  /** Set when the visitor is signed in: no account fields, uses their session. */
  account?: { email: string; demo?: boolean };
  /** Button text. Defaults to "Review My Profile". */
  label?: string;
  /** Ask the quiz questions before the upload step (landing page). */
  onboarding?: boolean;
};

type ApiResult = {
  error?: string;
  signIn?: boolean;
  submissionId?: string;
  uploads?: { path: string; token: string }[];
  checkoutUrl?: string;
  priceLabel?: string | null;
  /** Demo account: the review was published instantly. */
  reviewUrl?: string;
};

/** How long the "preparing" loader runs at least; it waits longer if the upload needs it. */
const PREPARE_MS = 5000;
/** Pause on a tapped answer before moving on, so the selection is seen. */
const ADVANCE_MS = 240;

/** Sections of the blurred preview on the paywall; the one they asked us to focus on goes first. */
const PREVIEW_SECTIONS = ["Photos", "Prompts", "Try this next"];

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function SubmitSheet({ account, label = "Review My Profile", onboarding = false }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const questions = onboarding ? QUESTIONS : [];
  const [full, setFull] = useState(false);
  const [view, setView] = useState<View>(questions.length ? { kind: "question", index: 0 } : { kind: "upload" });
  const [answers, setAnswers] = useState<Answers>({});
  const [items, setItems] = useState<Item[]>([]);
  const [email, setEmail] = useState(account?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [starting, setStarting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  /** Demo mode only: upload progress on the button, then the full-screen analyzing screen. */
  const [demoProgress, setDemoProgress] = useState<number | null>(null);
  const [demoReview, setDemoReview] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const advance = useRef<ReturnType<typeof setTimeout>>(undefined);
  const demo = Boolean(account?.demo);
  const busy = starting || redirecting || view.kind === "preparing";

  useEffect(() => {
    if (demo) return;
    fetch("/api/capacity")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setFull(Boolean(d.full)))
      .catch(() => {});
  }, [demo]);

  // Free the preview URLs when the sheet goes away.
  const live = useRef<Item[]>([]);
  useEffect(() => {
    live.current = items;
  }, [items]);
  useEffect(
    () => () => {
      clearTimeout(advance.current);
      live.current.forEach((i) => URL.revokeObjectURL(i.url));
    },
    [],
  );

  const totalBytes = items.reduce((n, i) => n + i.file.size, 0);
  const tooBig = totalBytes > MAX_SUBMISSION_MB * 1024 * 1024;

  function track(event: string, props?: Record<string, unknown>) {
    if (demo) return;
    try {
      posthog.capture(event, props);
    } catch {
      // Analytics must never break the app.
    }
  }

  function go(next: View) {
    setView(next);
    if (!onboarding) return;
    if (next.kind === "question") track("onboarding_step_viewed", { step: questions[next.index].id });
    if (next.kind === "upload") track("onboarding_step_viewed", { step: "upload" });
  }

  function open() {
    track("get_my_score_clicked", { path: window.location.pathname, signed_in: Boolean(account) });
    if (view.kind === "question" || view.kind === "upload") {
      // Pick up where they left off (answers are remembered across visits).
      const saved = onboarding ? loadAnswers() : {};
      const first = questions.findIndex((q) => !saved[q.id]);
      setAnswers(saved);
      go(first === -1 ? { kind: "upload" } : { kind: "question", index: first });
    }
    dialog.current?.showModal();
  }

  function pick(q: Question, index: number, value: string) {
    const next = { ...answers, [q.id]: value };
    setAnswers(next);
    saveAnswers(next);
    track("onboarding_answered", { question: q.id, answer: value, $set: { [`onboarding_${q.id}`]: value } });
    clearTimeout(advance.current);
    advance.current = setTimeout(
      () => go(index + 1 < questions.length ? { kind: "question", index: index + 1 } : { kind: "upload" }),
      ADVANCE_MS,
    );
  }

  function back() {
    if (busy) return;
    setError(null);
    if (view.kind === "upload") go({ kind: "question", index: questions.length - 1 });
    else if (view.kind === "question" && view.index > 0) go({ kind: "question", index: view.index - 1 });
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = [...list].filter((f) => ACCEPTED_TYPES.includes(f.type));
    setError(incoming.length < list.length ? "Only videos and images work here." : null);
    const added = incoming.slice(0, MAX_FILES - items.length).map<Item>((file) => ({
      file,
      url: URL.createObjectURL(file),
      kind: file.type.startsWith("video/") ? "video" : "image",
    }));
    setItems((prev) => [...prev, ...added]);
  }

  function removeItem(item: Item) {
    URL.revokeObjectURL(item.url);
    setItems((prev) => prev.filter((i) => i !== item));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNeedsSignIn(false);
    const website = String(new FormData(e.currentTarget).get("website") ?? "");
    const files = items.map((i) => i.file);

    if (!files.length) return setError("Add your screenshots first.");
    if (tooBig) return setError(`Keep it under ${MAX_SUBMISSION_MB} MB total.`);
    if (!account && !EMAIL_RE.test(email.trim())) return setError("Enter a valid email address.");

    setStarting(true);
    track("submission_started", { files: files.length, mb: Math.round(totalBytes / 1e5) / 10, signed_in: Boolean(account) });
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(account ? {} : { email }),
          website,
          onboarding: answers,
          files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
        }),
      });
      const start = await readJson<ApiResult>(res);
      if (!res.ok) {
        setNeedsSignIn(Boolean(start.signIn));
        throw new Error(start.error);
      }

      // The account and the slot exist: from here the loader covers the upload.
      if (demo) setDemoProgress(0);
      else {
        setOutcome(null);
        setView({ kind: "preparing" });
      }

      const loaded = new Array(files.length).fill(0);
      await Promise.all(
        files.map((file, i) =>
          uploadToSignedUrl(start.uploads![i].path, start.uploads![i].token, file, (n) => {
            loaded[i] = n;
            if (demo) setDemoProgress(loaded.reduce((a, b) => a + b, 0) / totalBytes);
          }),
        ),
      );

      const done = await fetch(`/api/submissions/${start.submissionId}/complete`, { method: "POST" });
      const result = await readJson<ApiResult>(done);
      if (!done.ok) throw new Error(result.error);
      if (result.reviewUrl) {
        // Demo account: show the analyzing screen, then the review that's already published.
        setDemoMedia(files);
        dialog.current?.close();
        setDemoReview(result.reviewUrl);
        return;
      }
      track("submission_uploaded", { submission_id: start.submissionId, needs_payment: Boolean(result.checkoutUrl) });
      // The loader reads this when its bar fills (see prepared()).
      setOutcome({ checkoutUrl: result.checkoutUrl, priceLabel: result.priceLabel });
    } catch (err) {
      track("submission_failed", { error: err instanceof Error ? err.message : String(err) });
      setView({ kind: "upload" });
      setError(err instanceof Error && err.message && err.message !== "network" ? err.message : "Upload failed. Check your connection and try again.");
    } finally {
      setStarting(false);
      setDemoProgress(null);
    }
  }

  /** The loader finished and the upload is in: show the paywall, or go home when it's free. */
  function prepared() {
    if (outcome?.checkoutUrl) {
      track("paywall_viewed", { price: outcome.priceLabel });
      setView({ kind: "paywall", checkoutUrl: outcome.checkoutUrl, priceLabel: outcome.priceLabel ?? null });
      return;
    }
    dialog.current?.close();
    router.push("/home");
    router.refresh();
  }

  function checkout(url: string) {
    track("paywall_checkout_clicked");
    setRedirecting(true);
    window.location.assign(url);
  }

  function close() {
    if (busy) return;
    dialog.current?.close();
  }

  /** Runs however the sheet closed (×, backdrop, Escape). */
  function closed() {
    if (view.kind !== "paywall") return;
    // They're signed in and the upload is saved: /home lets them finish paying later.
    track("paywall_dismissed");
    router.push("/home");
    router.refresh();
  }

  const totalSteps = questions.length + 1;
  const stepNo = view.kind === "question" ? view.index + 1 : totalSteps;
  const canGoBack = (view.kind === "question" && view.index > 0) || (view.kind === "upload" && questions.length > 0);
  const problem = optionOf("problem", answers);
  const focus = optionOf("focus", answers);
  const likes = optionOf("likes", answers);

  return (
    <>
      <button
        type="button"
        disabled={full && !demo}
        onClick={open}
        className="inline-flex items-center justify-center rounded-full bg-flame px-9 py-5 text-xl font-bold text-paper shadow-[0_10px_0_-2px_var(--flame-deep)] transition active:translate-y-1 active:shadow-[0_6px_0_-2px_var(--flame-deep)] hover:bg-flame-deep disabled:bg-line disabled:text-muted disabled:shadow-none disabled:cursor-not-allowed"
      >
        {full && !demo ? "We're full — back soon" : label}
      </button>

      <dialog
        ref={dialog}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
        onClose={closed}
        onClick={(e) => e.target === dialog.current && close()}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-paper p-0 text-ink sm:m-auto sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[460px] sm:rounded-3xl"
      >
        <div
          className={`flex min-h-full flex-col px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-left sm:p-8 ${
            onboarding ? "sm:min-h-[640px]" : ""
          }`}
        >
          {(view.kind === "question" || view.kind === "upload") && (
            <div className="flex items-center gap-3">
              {questions.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={back}
                    disabled={!canGoBack || busy}
                    aria-label="Back"
                    className="-ml-2 grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-line disabled:invisible"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div
                    role="progressbar"
                    aria-label="Progress"
                    aria-valuemin={0}
                    aria-valuemax={totalSteps}
                    aria-valuenow={stepNo}
                    className="h-2 flex-1 overflow-hidden rounded-full bg-line"
                  >
                    <div
                      className="h-full rounded-full bg-flame transition-[width] duration-500 ease-out"
                      style={{ width: `${(stepNo / (totalSteps + 1)) * 100}%` }}
                    />
                  </div>
                </>
              )}
              <CloseButton onClick={close} disabled={busy} className="-mr-2 ml-auto" />
            </div>
          )}

          {view.kind === "question" && (
            <QuestionStep
              key={questions[view.index].id}
              question={questions[view.index]}
              selected={answers[questions[view.index].id]}
              onPick={(value) => pick(questions[view.index], view.index, value)}
            />
          )}

          {view.kind === "upload" && (
            <form onSubmit={submit} noValidate className="step-in flex flex-1 flex-col">
              <h2 className="mt-6 text-[1.75rem] font-extrabold leading-[1.05] tracking-tight text-balance sm:text-3xl">
                Add your Hinge screenshots
              </h2>
              <p className="mt-2 text-muted text-pretty">
                Screenshot each picture and prompt on your profile. Takes 30 seconds. {focus?.tip}
              </p>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (!busy) addFiles(e.dataTransfer.files);
                }}
                className="mt-6"
              >
                {items.length === 0 ? (
                  <label
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-7 text-center transition ${
                      dragging ? "border-flame bg-flame/5" : "border-line hover:border-muted"
                    }`}
                  >
                    <FileInput onFiles={addFiles} disabled={busy} />
                    <ExampleScreens />
                    <span className="mt-5 font-bold">Tap to add your screenshots</span>
                    <span className="mt-1 text-sm text-muted">Up to {MAX_FILES}. Pictures and prompts.</span>
                  </label>
                ) : (
                  <>
                    <ul className="grid grid-cols-3 gap-2">
                      {items.map((item) => (
                        <li key={item.url} className="pop-in relative aspect-[3/4] overflow-hidden rounded-xl bg-line">
                          <span className="absolute inset-0 grid place-items-center p-2 text-center text-xs text-muted break-all">
                            {item.file.name}
                          </span>
                          {item.kind === "video" ? (
                            <video src={item.url} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element -- local object URL
                            <img
                              src={item.url}
                              alt=""
                              // Formats the browser can't draw (HEIC) fall back to the file name behind.
                              onError={(e) => (e.currentTarget.style.display = "none")}
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          )}
                          <button
                            type="button"
                            aria-label={`Remove ${item.file.name}`}
                            disabled={busy}
                            onClick={() => removeItem(item)}
                            className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-ink/75 text-base leading-none text-paper hover:bg-ink"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                      {items.length < MAX_FILES && (
                        <li>
                          <label
                            className={`flex aspect-[3/4] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-muted transition ${
                              dragging ? "border-flame bg-flame/5" : "border-line hover:border-muted hover:text-ink"
                            }`}
                          >
                            <FileInput onFiles={addFiles} disabled={busy} />
                            <span className="text-3xl leading-none">+</span>
                            <span className="mt-1 text-xs font-semibold">Add more</span>
                          </label>
                        </li>
                      )}
                    </ul>
                    <p className={`mt-2.5 text-sm ${tooBig ? "text-flame-deep" : "text-muted"}`}>
                      {tooBig
                        ? `${mb(totalBytes)} total. Keep it under ${MAX_SUBMISSION_MB} MB.`
                        : items.length < MAX_FILES
                          ? `${items.length} of ${MAX_FILES} added. The more we see, the sharper your score.`
                          : `${MAX_FILES} of ${MAX_FILES} added. Perfect.`}
                    </p>
                  </>
                )}
              </div>

              {account ? (
                <p className="mt-5 text-sm text-muted">
                  Signed in as <span className="text-ink font-medium">{account.email}</span>
                </p>
              ) : (
                <div className="mt-5">
                  <label htmlFor="submit-email" className="text-sm font-semibold">
                    Where should we send your score?
                  </label>
                  <input
                    id="submit-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="you@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                    className="mt-2 w-full rounded-xl border border-line bg-paper px-4 py-3.5 text-base outline-none focus:border-ink"
                  />
                  {/* honeypot */}
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
                </div>
              )}

              {error && (
                <p role="alert" className="mt-4 text-sm text-flame-deep">
                  {error}
                  {needsSignIn && (
                    <>
                      {" "}
                      <Link href="/signin" className="font-semibold text-ink underline underline-offset-4">
                        Sign in
                      </Link>
                    </>
                  )}
                </p>
              )}

              <div className="mt-auto pt-6">
                <button
                  type="submit"
                  disabled={busy}
                  className="relative w-full overflow-hidden rounded-full bg-flame py-4 text-lg font-bold text-paper hover:bg-flame-deep disabled:hover:bg-flame"
                >
                  {demoProgress !== null && (
                    <span
                      className="absolute inset-y-0 left-0 bg-flame-deep transition-[width]"
                      style={{ width: `${Math.round(demoProgress * 100)}%` }}
                    />
                  )}
                  <span className="relative">
                    {demoProgress !== null ? `Uploading ${Math.round(demoProgress * 100)}%` : starting ? "One sec…" : "Get my score"}
                  </span>
                </button>
                <p className="mt-3 text-center text-xs text-muted">🔒 Private. Only your reviewer sees your screenshots.</p>
              </div>
            </form>
          )}

          {view.kind === "preparing" && (
            <div className="flex flex-1 items-center justify-center py-6">
              <AnalyzingPanel
                media={items.map((i) => ({ url: i.url, name: i.file.name, kind: i.kind }))}
                duration={PREPARE_MS}
                ready={outcome !== null}
                onDone={prepared}
                eyebrow="Preparing your review"
                doneTitle="You're all set 🔥"
                steps={[
                  ...(problem ? [`Noting that ${problem.recap}`] : []),
                  ...(focus ? [`Setting the focus on ${focus.recap}`] : []),
                  ...(likes ? [`Saving your baseline: ${likes.recap}`] : []),
                  `Uploading your ${plural(items.length, "screenshot")}`,
                  "Checking everything came through",
                  "Setting up your review",
                ]}
              />
            </div>
          )}

          {view.kind === "paywall" && (
            <div className="step-in flex flex-1 flex-col">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-good/10 px-3 py-1.5 text-sm font-semibold text-good">
                  <Check size={14} />
                  {plural(items.length, "screenshot")} received
                </span>
                <CloseButton onClick={close} disabled={busy} className="-mr-2" />
              </div>

              <h2 className="mt-6 text-[2rem] font-extrabold leading-[1.02] tracking-tight text-balance sm:text-4xl">
                Unlock your Hinge score 🔥
              </h2>
              <p className="mt-3 text-muted text-pretty">
                {problem
                  ? `Your review is built around the fact that ${problem.recap}${focus ? `, with a deeper look at ${focus.recap}` : ""}.`
                  : "A real review of your profile, written for you."}
              </p>

              <LockedPreview promptsFirst={focus?.value === "prompts"} />
              <p className="mt-3 text-sm text-muted">
                Plus a step-by-step plan to get more likes, and a free follow-up question.
              </p>

              <div className="mt-auto pt-8">
                <button
                  type="button"
                  onClick={() => checkout(view.checkoutUrl)}
                  disabled={redirecting}
                  className="w-full rounded-full bg-flame py-5 text-xl font-bold text-paper shadow-[0_10px_0_-2px_var(--flame-deep)] transition active:translate-y-1 active:shadow-[0_6px_0_-2px_var(--flame-deep)] hover:bg-flame-deep disabled:opacity-80"
                >
                  {redirecting ? "One sec…" : `Unlock my score${view.priceLabel ? ` · ${view.priceLabel}` : ""}`}
                </button>
                <p className="mt-6 text-center text-xs text-muted">
                  One-time payment. Secure checkout by Stripe.
                  <br />
                  We&apos;ll email you as soon as your review is ready.
                </p>
              </div>
            </div>
          )}
        </div>
      </dialog>

      {demoReview && (
        <DemoAnalyzing
          media={getDemoMedia()}
          onDone={() => {
            setItems([]);
            router.push(demoReview);
          }}
        />
      )}
    </>
  );
}

/** One quiz question: tapping an answer selects it and moves on. */
function QuestionStep({
  question,
  selected,
  onPick,
}: {
  question: Question;
  selected: string | undefined;
  onPick: (value: string) => void;
}) {
  const grid = question.layout === "grid";
  return (
    <div className="step-in flex flex-1 flex-col">
      <h2 className="mt-6 text-[1.75rem] font-extrabold leading-[1.05] tracking-tight text-balance sm:text-3xl">
        {question.title}
      </h2>
      {question.sub && <p className="mt-2 text-muted">{question.sub}</p>}

      <div role="radiogroup" aria-label={question.title} className={`mt-7 grid gap-3 ${grid ? "grid-cols-2" : ""}`}>
        {question.options.map((o) => {
          const on = selected === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(o.value)}
              className={`flex rounded-2xl border-2 font-semibold transition active:scale-[0.98] ${
                grid ? "flex-col items-center gap-2 px-3 py-6 text-center text-lg" : "items-center gap-3.5 px-4 py-4 text-left"
              } ${on ? "border-flame bg-flame/5" : "border-line hover:border-muted"}`}
            >
              <span aria-hidden className={grid ? "text-3xl" : "text-2xl"}>
                {o.emoji}
              </span>
              <span className={grid ? "" : "flex-1"}>{o.label}</span>
              {!grid && (
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full transition-colors ${
                    on ? "bg-flame text-paper" : "border-2 border-line"
                  }`}
                >
                  {on && <Check size={14} />}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * What they're paying for, locked: the score ring and the review's sections, text blurred.
 * The score shows a lock, not a number, because the review is written after payment.
 */
function LockedPreview({ promptsFirst }: { promptsFirst: boolean }) {
  const order = promptsFirst ? ["Prompts", "Photos", "Try this next"] : PREVIEW_SECTIONS;
  const sections = order.map((h) => LOCKED_PREVIEW.find(([heading]) => heading === h)!);
  return (
    <div className="relative mt-6 max-h-[21rem] overflow-hidden rounded-2xl border border-line">
      <div className="flex items-center gap-4 border-b border-line px-4 py-3">
        <span className="relative grid size-14 shrink-0 place-items-center">
          <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden className="absolute inset-0 -rotate-90">
            <circle cx="28" cy="28" r="25" fill="none" strokeWidth="5" className="stroke-line" />
            <circle
              cx="28"
              cy="28"
              r="25"
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray="157"
              strokeDashoffset="55"
              className="stroke-flame/50 blur-[2px]"
            />
          </svg>
          <Lock />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Your profile score</span>
          <span className="text-sm text-muted">Out of 100</span>
        </span>
        <span className="rounded-full bg-ink px-3 py-1 text-xs font-bold text-paper">Locked</span>
      </div>
      <div className="space-y-4 px-4 py-4">
        {sections.map(([heading, body]) => (
          <div key={heading}>
            <h3 className="font-bold">{heading}</h3>
            <p aria-hidden className="mt-1 line-clamp-2 select-none text-sm leading-relaxed text-ink/80 blur-[5px]">
              {body}
            </p>
          </div>
        ))}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-b from-paper/0 to-paper" />
    </div>
  );
}

function Lock() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="relative">
      <rect x="5" y="11" width="14" height="9" rx="2.5" fill="currentColor" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Three tiny profile screens (picture, prompt, picture) showing what to send. */
function ExampleScreens() {
  const card = "h-[84px] w-[54px] rounded-xl border-2 border-paper bg-line shadow-[0_8px_18px_-8px_rgb(23_18_28/0.35)]";
  return (
    <span aria-hidden className="flex items-end justify-center">
      <span className={`${card} grid -rotate-6 place-items-center bg-flame/15 text-2xl`}>📸</span>
      <span className={`${card} z-10 -mx-2 mb-2 flex flex-col justify-center gap-1.5 bg-butter/40 px-2`}>
        <span className="h-1.5 w-full rounded-full bg-ink/70" />
        <span className="h-1.5 w-4/5 rounded-full bg-ink/30" />
        <span className="h-1.5 w-3/5 rounded-full bg-ink/30" />
      </span>
      <span className={`${card} grid rotate-6 place-items-center bg-flame/15 text-2xl`}>🤳</span>
    </span>
  );
}

function FileInput({ onFiles, disabled }: { onFiles: (list: FileList | null) => void; disabled: boolean }) {
  return (
    <input
      type="file"
      multiple
      accept={ACCEPTED_TYPES.join(",")}
      className="sr-only"
      onChange={(e) => {
        onFiles(e.target.files);
        e.target.value = "";
      }}
      disabled={disabled}
    />
  );
}

function CloseButton({ onClick, disabled, className = "" }: { onClick: () => void; disabled: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Close"
      className={`grid size-10 shrink-0 place-items-center rounded-full text-2xl leading-none text-muted hover:bg-line disabled:opacity-30 ${className}`}
    >
      ×
    </button>
  );
}

function Check({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

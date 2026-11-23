import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import HeardFrom from "@/components/HeardFrom";
import PayButton from "@/components/PayButton";
import SubmitSheet from "@/components/SubmitSheet";
import SignOutForm from "@/components/SignOutForm";
import { supabaseServer } from "@/lib/supabase/server";
import { isDemoUser } from "@/lib/demo";
import { getSetting } from "@/lib/supabase/admin";
import { checkoutPlans, confirmCheckout, isLocked } from "@/lib/stripe";
import { membership } from "@/lib/billing";
import PlanStatus from "@/components/PlanStatus";
import { safeNextPath } from "@/lib/next-path";
import { offerEndsAt } from "@/lib/plans";
import ReviewThumb from "@/components/ReviewThumb";
import ScoreRing from "@/components/ScoreRing";
import { BUCKET, supabaseAdmin } from "@/lib/supabase/admin";
import { RUBRICS, SCORE_COLUMNS, profileScore, scoreColor, scoreVerdict, scoresFromRow, type Scores } from "@/lib/score";

// Room for the AI review that can start when a payment is confirmed here (lib/ai-review).
export const maxDuration = 300;

type Submission = {
  id: string;
  status: "uploading" | "queued" | "reviewing" | "done" | "expired";
  submitted_at: string | null;
  created_at: string;
  file_paths: string[];
  unlock_required: boolean;
  paid_at: string | null;
};

/** Unpaid uploads are only resumable while there's room for a 30-minute Checkout Session. */
const MIN_MINUTES_TO_PAY = 31;

function canStillPay(s: Submission, windowMinutes: number) {
  const ageMinutes = (Date.now() - new Date(s.created_at).getTime()) / 60_000;
  return s.file_paths.length > 0 && windowMinutes - ageMinutes >= MIN_MINUTES_TO_PAY;
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default function Home({ searchParams }: PageProps<"/home">) {
  return (
    <main className="flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-3xl px-5 sm:px-8 pt-6 flex items-center justify-between">
        <Link href="/" className="text-lg font-extrabold tracking-tight">
          matchbro.app 🔥
        </Link>
        <nav className="flex items-center gap-5">
          <Link href="/billing" className="text-sm text-muted hover:text-ink">
            Billing
          </Link>
          <SignOutForm>
            <button className="text-sm text-muted hover:text-ink">
              Sign out
            </button>
          </SignOutForm>
        </nav>
      </header>

      <section className="mx-auto w-full max-w-3xl px-5 sm:px-8 py-14">
        <Suspense fallback={<ReviewsSkeleton />}>
          <Reviews searchParams={searchParams} />
        </Suspense>
      </section>

      <footer className="mt-auto mx-auto w-full max-w-3xl px-5 sm:px-8 pb-8 text-center text-sm text-muted">
        Any questions? Email us at{" "}
        <a href="mailto:support@matchbro.app" className="font-medium text-ink underline underline-offset-2 hover:text-flame">
          support@matchbro.app
        </a>
      </footer>
    </main>
  );
}

/** Same layout as the cards below, shown while the reviews load. */
function ReviewsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your reviews">
      <h1 className="text-5xl sm:text-6xl font-extrabold tracking-[-0.04em] leading-none">Your reviews</h1>
      <ul className="mt-10 space-y-4 animate-pulse">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-4 rounded-3xl border border-line p-3">
            <span className="h-28 w-24 rounded-2xl bg-line" />
            <span className="flex-1 space-y-2.5">
              <span className="block h-4 w-32 rounded-md bg-line" />
              <span className="block h-6 w-40 rounded-md bg-line" />
              <span className="block h-4 w-48 rounded-md bg-line" />
            </span>
            <span className="mr-2 hidden size-[4.5rem] rounded-full bg-line sm:block" />
          </li>
        ))}
      </ul>
    </div>
  );
}

async function Reviews({ searchParams }: { searchParams: PageProps<"/home">["searchParams"] }) {
  // Request time only: this reads the clock and can confirm a Stripe payment, neither of which belongs in a prefetch.
  await connection();
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // Back from Stripe: confirm right away instead of waiting for the webhook.
  const params = await searchParams;
  const sessionId = typeof params.session_id === "string" ? params.session_id : null;
  const result = sessionId ? await confirmCheckout(sessionId, user.id) : null;
  const payment = result?.status ?? null;
  const claim = result?.status === "paid" ? result.claim : null;
  // Paid with an email that already had an account (here, or from an unlock on a review page).
  const movedTo = claim?.movedToExistingAccount ? claim.email : typeof params.moved === "string" ? params.moved : null;
  const movedNext = safeNextPath(typeof params.next === "string" ? params.next : null) ?? "/home";
  const cancelled = params.checkout === "cancelled";

  const [{ data }, plans, windowMinutes, { data: followUps }, member] = await Promise.all([
    supabase
      .from("submissions")
      .select("id, status, submitted_at, created_at, file_paths, unlock_required, paid_at")
      .in("status", ["uploading", "queued", "reviewing", "done"])
      .order("submitted_at", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false }),
    checkoutPlans(),
    getSetting("upload_window_minutes"),
    supabase.from("follow_ups").select("submission_id, answered_at"),
    membership(user.id).catch((e) => {
      console.error("membership", e);
      return null;
    }),
  ]);
  const followUpOf = new Map((followUps ?? []).map((f) => [f.submission_id, f.answered_at ? "answered" : "asked"] as const));
  const submissions = ((data ?? []) as Submission[]).filter(
    (s) => s.status !== "uploading" || (plans !== null && canStillPay(s, windowMinutes)),
  );
  const { scoresOf, photosOf } = await cardData(submissions);
  const deltaOf = scoreDeltas(submissions, scoresOf);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-[-0.04em] leading-none">
          Your reviews
        </h1>
      </div>

      {movedTo ? (
        <AccountExists email={movedTo} next={movedNext} />
      ) : (
        payment === "paid" && (
          <p role="status" className="mt-8 rounded-2xl bg-flame/10 px-5 py-4 font-medium">
            Payment received. We&apos;ll email {claim?.email ? <strong>{claim.email}</strong> : "you"} as soon as your
            review is ready 🔥
          </p>
        )
      )}
      {payment === "paid" && <HeardFrom />}
      {payment === "pending" && (
        <p role="status" className="mt-8 rounded-2xl bg-line/60 px-5 py-4 font-medium">
          Your payment is processing. We&apos;ll start your review as soon as it clears.
        </p>
      )}
      {cancelled && (
        <p role="status" className="mt-8 rounded-2xl bg-line/60 px-5 py-4 font-medium">
          Payment cancelled. Your upload is saved for a little while, so you can finish paying below.
        </p>
      )}

      {member && <PlanStatus membership={member} />}

      {submissions.length === 0 ? (
        <p className="mt-12 text-lg text-muted">
          Nothing here yet. Send your first recording to get a review.
        </p>
      ) : (
        <ul className="mt-10 space-y-4">
          {submissions.map((s, i) => (
            <ReviewCard
              key={s.id}
              sub={s}
              number={submissions.length - i}
              scores={scoresOf.get(s.id) ?? null}
              photos={photosOf.get(s.id) ?? []}
              delta={deltaOf.get(s.id) ?? null}
              followUp={followUpOf.get(s.id) ?? null}
              pay={
                s.status === "uploading" && plans ? (
                  <PayButton submissionId={s.id} plans={plans} offerEndsAt={offerEndsAt(s.created_at)} />
                ) : null
              }
            />
          ))}
        </ul>
      )}

      <div className="flex justify-center mt-8 mb-5"><SubmitSheet account={{ email: user.email ?? "", demo: isDemoUser(user) }} /></div>

    </>
  );
}

/** They paid with an email that already has an account: the review is there, so sign in to it. */
function AccountExists({ email, next }: { email: string; next: string }) {
  return (
    <div role="status" className="mt-8 rounded-2xl bg-flame/10 px-5 py-5">
      <p className="font-bold">Payment received 🔥</p>
      <p className="mt-1">
        <strong>{email}</strong> already has an account, so we added this review to it. Sign in with that email to
        see it.
      </p>
      <SignOutForm className="mt-4" next={`/signin?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`}>
        <button className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-paper hover:bg-flame">
          Sign in as {email}
        </button>
      </SignOutForm>
    </div>
  );
}

const IMAGE_FILE = /\.(jpe?g|png|webp|heic|heif|gif)$/i;

/**
 * Scores of each published review (locked ones too: owners see the score on a
 * locked review, and RLS hides those rows from them, so this reads them with
 * the admin client; the ids come from the user's own RLS-filtered submissions)
 * and up to 3 signed pictures per submission for the card cover.
 */
async function cardData(subs: Submission[]) {
  const scoresOf = new Map<string, Scores>();
  const photosOf = new Map<string, string[]>();
  if (!subs.length) return { scoresOf, photosOf };
  const db = supabaseAdmin();
  const covers = subs.flatMap((s) => s.file_paths.filter((f) => IMAGE_FILE.test(f)).slice(0, 3).map((path) => ({ id: s.id, path })));
  const [{ data: reports }, { data: signed }] = await Promise.all([
    db
      .from("reports")
      .select(`submission_id, published_at, ${SCORE_COLUMNS}`)
      .in("submission_id", subs.map((s) => s.id))
      .not("published_at", "is", null),
    covers.length
      ? db.storage.from(BUCKET).createSignedUrls(covers.map((c) => c.path), 3600)
      : Promise.resolve({ data: [] as { signedUrl: string | null }[] }),
  ]);
  for (const r of reports ?? []) scoresOf.set(r.submission_id, scoresFromRow(r));
  (signed ?? []).forEach((d, i) => {
    if (!d.signedUrl) return;
    const id = covers[i].id;
    photosOf.set(id, [...(photosOf.get(id) ?? []), d.signedUrl]);
  });
  return { scoresOf, photosOf };
}

/** How much each review's overall score moved since the previous scored review. */
function scoreDeltas(subs: Submission[], scoresOf: Map<string, Scores>) {
  const deltas = new Map<string, number>();
  const scored = subs
    .map((s) => ({ id: s.id, at: s.submitted_at ?? s.created_at, total: profileScore(scoresOf.get(s.id) ?? EMPTY) }))
    .filter((s): s is { id: string; at: string; total: number } => s.total !== null)
    .sort((a, b) => a.at.localeCompare(b.at));
  scored.forEach((s, i) => {
    if (i > 0) deltas.set(s.id, s.total - scored[i - 1].total);
  });
  return deltas;
}

const EMPTY: Scores = { pictures: null, prompts: null, conversation: null, settings: null };

function filesLabel(paths: string[]) {
  const videos = paths.filter((p) => /\.(mp4|mov|webm|m4v)$/i.test(p)).length;
  const images = paths.length - videos;
  const parts = [
    images ? `${images} screenshot${images > 1 ? "s" : ""}` : "",
    videos ? `${videos} recording${videos > 1 ? "s" : ""}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function ReviewCard({
  sub,
  number,
  scores,
  photos,
  delta,
  followUp,
  pay,
}: {
  sub: Submission;
  number: number;
  scores: Scores | null;
  photos: string[];
  delta: number | null;
  followUp: "asked" | "answered" | null;
  pay: React.ReactNode;
}) {
  const href = `/reviews/${sub.id}`;
  const date = dateFmt.format(new Date(sub.submitted_at ?? sub.created_at));
  const files = filesLabel(sub.file_paths);
  const total = scores ? profileScore(scores) : null;
  const locked = isLocked(sub);
  const waiting = sub.status === "uploading";
  const inReview = sub.status === "queued" || sub.status === "reviewing" || (sub.status === "done" && total === null);

  return (
    <li
      className={`group relative flex items-start gap-4 rounded-3xl border bg-paper p-3 pr-4 transition sm:items-center sm:gap-5 sm:pr-6 ${
        waiting ? "border-dashed border-muted/50" : "border-line hover:-translate-y-0.5 hover:border-ink hover:shadow-[0_14px_30px_-16px_rgb(0_0_0/0.35)]"
      }`}
    >
      <div className="relative">
        <ReviewThumb photos={photos} className={`h-28 w-[5.5rem] rounded-2xl sm:h-32 sm:w-28 ${waiting ? "opacity-60 grayscale" : ""}`} />
        {total !== null && (
          // Phones: the score sits on the picture's corner instead of the big ring.
          <span
            className={`absolute -bottom-1.5 -right-1.5 rounded-full border-2 border-paper px-2 py-0.5 text-sm font-extrabold tabular-nums sm:hidden ${total >= 50 && total <= 80 ? "text-ink" : "text-paper"}`}
            style={{ background: scoreColor(total) }}
          >
            {total}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Review #{number} · {date}
        </p>

        {total !== null ? (
          <>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xl font-extrabold tracking-tight sm:text-2xl">{scoreVerdict(total)}</span>
              {locked && (
                <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-paper">🔒 Locked</span>
              )}
              {delta !== null && delta !== 0 && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${delta > 0 ? "bg-good/12 text-good" : "bg-bad/10 text-bad"}`}
                  title="Since your previous review"
                >
                  {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} pts
                </span>
              )}
            </p>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {RUBRICS.map(({ key, label }) =>
                scores![key] === null ? null : (
                  <span key={key} className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: scoreColor(scores![key]!) }} />
                    {label} <span className="font-bold text-ink tabular-nums">{scores![key]}</span>
                  </span>
                ),
              )}
            </p>
          </>
        ) : waiting ? (
          <p className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">Waiting for payment</p>
        ) : (
          <p className="mt-1 flex items-center gap-2 whitespace-nowrap text-xl font-extrabold tracking-tight sm:text-2xl">
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-flame opacity-70 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2.5 rounded-full bg-flame" />
            </span>
            Being reviewed
          </p>
        )}

        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {files && <span className="text-muted">{files}</span>}
          {inReview && !waiting && <span className="text-muted">We&apos;ll email you when it&apos;s ready</span>}
          {followUp === "answered" && (
            <Link href={`${href}#follow-up`} className="relative z-10 font-semibold text-flame-deep hover:underline">
              💬 Tim answered your question
            </Link>
          )}
          {followUp === "asked" && <span className="text-muted">Follow-up sent ⏳</span>}
        </p>

        {waiting && pay && <div className="relative z-10 mt-3">{pay}</div>}
      </div>

      {!waiting && (
        <div className="flex shrink-0 items-center sm:gap-4">
          {total !== null && (
            <span className="hidden sm:block">
              <ScoreRing score={total} size={72} animate />
            </span>
          )}
          <Link
            href={href}
            // The whole card is the link; the follow-up link above sits on top of it.
            className="after:absolute after:inset-0 after:rounded-3xl sm:grid sm:size-10 sm:place-items-center sm:rounded-full sm:bg-ink sm:text-paper sm:transition sm:group-hover:bg-flame"
            aria-label={`Open review #${number} from ${date}${locked ? " (locked)" : ""}`}
          >
            {locked ? (
              <span aria-hidden className="hidden text-sm sm:inline">🔒</span>
            ) : (
              <svg className="hidden sm:block" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </Link>
        </div>
      )}
    </li>
  );
}

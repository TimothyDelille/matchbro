import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import HeardFrom from "@/components/HeardFrom";
import PayButton from "@/components/PayButton";
import SubmitSheet from "@/components/SubmitSheet";
import SignOutForm from "@/components/SignOutForm";
import { supabaseServer } from "@/lib/supabase/server";
import { isDemoUser } from "@/lib/demo";
import { getSetting } from "@/lib/supabase/admin";
import { checkoutPriceLabel, confirmCheckout, isLocked } from "@/lib/stripe";
import { safeNextPath } from "@/lib/next-path";

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
        <SignOutForm>
          <button className="text-sm text-muted hover:text-ink">
            Sign out
          </button>
        </SignOutForm>
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

/** Same layout as the list below, shown while the reviews load. */
function ReviewsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your reviews">
      <h1 className="text-5xl sm:text-6xl font-extrabold tracking-[-0.04em] leading-none">Your reviews</h1>
      <ul className="mt-12 divide-y divide-line border-y border-line animate-pulse">
        {["w-28", "w-24", "w-32"].map((w) => (
          <li key={w} className="flex items-center justify-between gap-4 py-5">
            <span className={`h-5 ${w} rounded-md bg-line`} />
            <span className="h-9 w-28 rounded-full bg-line" />
          </li>
        ))}
      </ul>
      <div className="my-5 flex justify-center">
        <span className="h-[4.25rem] w-64 animate-pulse rounded-full bg-line" />
      </div>
    </div>
  );
}

async function Reviews({ searchParams }: { searchParams: PageProps<"/home">["searchParams"] }) {
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

  const [{ data }, priceLabel, windowMinutes, { data: followUps }] = await Promise.all([
    supabase
      .from("submissions")
      .select("id, status, submitted_at, created_at, file_paths, unlock_required, paid_at")
      .in("status", ["uploading", "queued", "reviewing", "done"])
      .order("submitted_at", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false }),
    checkoutPriceLabel(),
    getSetting("upload_window_minutes"),
    supabase.from("follow_ups").select("submission_id, answered_at"),
  ]);
  const followUpOf = new Map((followUps ?? []).map((f) => [f.submission_id, f.answered_at ? "answered" : "asked"] as const));
  const submissions = ((data ?? []) as Submission[]).filter(
    (s) => s.status !== "uploading" || (priceLabel !== null && canStillPay(s, windowMinutes)),
  );

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

      {submissions.length === 0 ? (
        <p className="mt-12 text-lg text-muted">
          Nothing here yet. Send your first recording to get a review.
        </p>
      ) : (
        <ul className="mt-12 divide-y divide-line border-y border-line">
          {submissions.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-4 py-5"
            >
              <span className="font-semibold">
                {dateFmt.format(new Date(s.submitted_at ?? s.created_at))}
              </span>
              {s.status === "uploading" ? (
                <span className="flex items-center gap-3">
                  <span className="text-muted text-sm">Waiting for payment</span>
                  <PayButton submissionId={s.id} priceLabel={priceLabel} />
                </span>
              ) : (
                <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                  {followUpOf.get(s.id) === "answered" && (
                    <Link href={`/reviews/${s.id}#follow-up`} className="text-sm font-medium text-flame-deep hover:underline">
                      💬 Tim answered your question
                    </Link>
                  )}
                  {followUpOf.get(s.id) === "asked" && (
                    <span className="text-sm text-muted">Follow-up sent ⏳</span>
                  )}
                  <Status id={s.id} status={s.status} locked={isLocked(s)} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-center my-5"><SubmitSheet account={{ email: user.email ?? "", demo: isDemoUser(user) }} /></div>

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

function Status({
  id,
  status,
  locked,
}: {
  id: string;
  status: Exclude<Submission["status"], "uploading">;
  locked: boolean;
}) {
  if (status === "queued" || status === "reviewing") {
    return (
      <span className="text-flame-deep font-medium">Currently being reviewed ⏳</span>
    );
  }
  return (
    <Link
      href={`/reviews/${id}`}
      className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-paper hover:bg-flame"
    >
      {locked ? "Reviewed! Unlock 🔒" : "Reviewed! 🔥"}
    </Link>
  );
}

import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import FollowUpSection from "@/components/FollowUpSection";
import LockedReport from "@/components/LockedReport";
import Markdown from "@/components/Markdown";
import MediaCarousel from "@/components/MediaCarousel";
import ScoreCard from "@/components/ScoreCard";
import { isAdmin } from "@/lib/admin-auth";
import { referencedAssets, signAssets, signSubmissionMedia } from "@/lib/report";
import { SCORE_COLUMNS, scoresFromRow } from "@/lib/score";
import { confirmCheckout, isLocked, roastPriceLabel } from "@/lib/stripe";
import { FOLLOW_UP_COLUMNS, type FollowUp } from "@/lib/follow-up";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { signInUrl } from "@/lib/next-path";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

export default function ReviewPage({ params, searchParams }: PageProps<"/reviews/[id]">) {
  return (
    <main className="flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-3xl px-5 sm:px-8 pt-6 flex items-center justify-between">
        <Link href="/home" className="text-lg font-extrabold tracking-tight">
          matchbro.app 🔥
        </Link>
        <Link href="/home" className="text-sm text-muted hover:text-ink">
          Your reviews
        </Link>
      </header>
      <Suspense fallback={<p className="mx-auto w-full max-w-3xl px-5 sm:px-8 py-14 text-muted">Loading…</p>}>
        <Review params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Review({
  params,
  searchParams,
}: {
  params: PageProps<"/reviews/[id]">["params"];
  searchParams: PageProps<"/reviews/[id]">["searchParams"];
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(signInUrl(`/reviews/${id}`));
  const admin = isAdmin(user);

  // Back from unlocking on Stripe: confirm right away instead of waiting for the webhook.
  const sessionId = typeof query.session_id === "string" ? query.session_id : null;
  const payment = sessionId ? await confirmCheckout(sessionId, user.id) : null;

  // Owners read their own submission through RLS; admins can see any.
  const { data: sub } = await (admin ? supabaseAdmin() : supabase)
    .from("submissions")
    .select("file_paths, unlock_required, paid_at")
    .eq("id", id)
    .maybeSingle();
  if (!sub) notFound();

  // A locked review: the owner sees the score, the text stays on the server.
  // RLS hides locked reports from owners, so the scores are read with the admin
  // client (ownership was checked by the RLS read above). Admins see it all,
  // or the user's locked view with ?view=user.
  const locked = isLocked(sub) && (!admin || query.view === "user");
  const { data: report } = await (admin || locked ? supabaseAdmin() : supabase)
    .from("reports")
    .select(`user_id, markdown, audio_path, published_at, ${SCORE_COLUMNS}`)
    .eq("submission_id", id)
    .maybeSingle();
  if (!report || (!report.published_at && !admin)) notFound();

  const [assets, media, priceLabel, followUp] = await Promise.all([
    locked ? {} : signAssets(report.user_id, id, referencedAssets(report.markdown, report.audio_path)),
    signSubmissionMedia(sub.file_paths ?? []),
    locked ? roastPriceLabel() : null,
    locked
      ? null
      : (admin ? supabaseAdmin() : supabase)
          .from("follow_ups")
          .select(FOLLOW_UP_COLUMNS)
          .eq("submission_id", id)
          .maybeSingle()
          .then(({ data }) => data as FollowUp | null),
  ]);
  const audio = !locked && report.audio_path ? (assets as Record<string, string>)[report.audio_path] : null;

  return (
    <article className="mx-auto w-full max-w-3xl px-5 sm:px-8 pt-2 pb-16">
      <p className="text-muted">
        {report.published_at ? `Reviewed on ${dateFmt.format(new Date(report.published_at))}` : "Draft preview"}
      </p>

      {payment === "paid" && (
        <p role="status" className="mt-6 rounded-2xl bg-flame/10 px-5 py-4 font-medium">
          Your full profile review is unlocked! 🔓
        </p>
      )}
      {payment === "pending" && (
        <p role="status" className="mt-6 rounded-2xl bg-line/60 px-5 py-4 font-medium">
          Your payment is processing. The review unlocks as soon as it clears.
        </p>
      )}
      {admin && isLocked(sub) && (
        <p className="mt-6 rounded-2xl bg-butter/40 px-5 py-4 text-sm font-medium">
          Locked for the user until they pay.{" "}
          <Link href={locked ? `/reviews/${id}` : `/reviews/${id}?view=user`} className="underline underline-offset-2">
            {locked ? "Show full review" : "See what they see"}
          </Link>
        </p>
      )}

      {/* Their own pictures sit behind the score, locked or not. */}
      <ScoreCard
        scores={scoresFromRow(report)}
        photos={media.filter((m) => m.kind === "image").slice(0, 6).map((m) => m.url)}
      />

      {/* Locked: skip the uploads strip so the paywall sits right under the score. */}
      {!locked && <MediaCarousel items={media} />}

      {locked && <LockedReport submissionId={id} priceLabel={priceLabel} preview={report.user_id !== user.id} />}

      {audio && (
        <div className="mt-10 rounded-3xl bg-ink p-5 sm:p-6 text-paper">
          <p className="font-bold">Listen to the walkthrough</p>
          <audio src={audio} controls preload="metadata" className="mt-4 w-full" />
        </div>
      )}

      {!locked && report.markdown.trim() && (
        <div className="mt-10">
          <Markdown markdown={report.markdown} assets={assets} />
        </div>
      )}
      {!locked && report.published_at && (
        <FollowUpSection
          submissionId={id}
          followUp={followUp}
          canAsk={report.user_id === user.id}
        />
      )}
      {!locked && (
        <p className="mt-12 border-t border-line pt-6 text-muted">
          If you have any questions, feel free to reach out to:{" "}
          <a href="mailto:support@matchbro.app" className="font-semibold text-flame-deep hover:underline">
            support@matchbro.app
          </a>
        </p>
      )}
    </article>
  );
}

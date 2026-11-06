import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { BUCKET, supabaseAdmin } from "@/lib/supabase/admin";
import { referencedAssets, signAssets } from "@/lib/report";
import AdminHeader from "@/components/admin/AdminHeader";
import ReportEditor from "@/components/admin/ReportEditor";
import PaidPill from "@/components/admin/PaidPill";
import { SCORE_COLUMNS, scoresFromRow } from "@/lib/score";

const when = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Los_Angeles",
});

export default function ReviewPage({ params }: PageProps<"/admin/submissions/[id]">) {
  return (
    <main className="flex-1 flex flex-col">
      <AdminHeader wide />
      <Suspense fallback={<p className="mx-auto w-full max-w-7xl px-5 sm:px-8 py-10 text-muted">Loading…</p>}>
        <Review params={params} />
      </Suspense>
    </main>
  );
}

async function Review({ params }: { params: PageProps<"/admin/submissions/[id]">["params"] }) {
  await requireAdmin();
  const { id } = await params;
  const db = supabaseAdmin();

  const { data: sub } = await db
    .from("submissions")
    .select("id, user_id, status, submitted_at, created_at, paid_at, file_paths")
    .eq("id", id)
    .maybeSingle();
  if (!sub || !["uploading", "queued", "reviewing", "done"].includes(sub.status)) notFound();

  const [{ data: profile }, { data: report }, { data: signed }] = await Promise.all([
    db.from("profiles").select("email, phone").eq("id", sub.user_id).maybeSingle(),
    db
      .from("reports")
      .select(`markdown, audio_path, published_at, updated_at, ${SCORE_COLUMNS}`)
      .eq("submission_id", id)
      .maybeSingle(),
    sub.file_paths.length
      ? db.storage.from(BUCKET).createSignedUrls(sub.file_paths, 3600)
      : Promise.resolve({ data: [] as { signedUrl: string | null; path: string | null }[] }),
  ]);

  const media = (signed ?? [])
    .filter((m) => m.signedUrl)
    .map((m) => ({ url: m.signedUrl!, name: (m.path ?? "").split("/").pop() ?? "file" }));

  const markdown = report?.markdown ?? "";
  const audioPath = report?.audio_path ?? null;
  const assets = await signAssets(sub.user_id, id, referencedAssets(markdown, audioPath));

  return (
    <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 py-8">
      <Link href="/admin" className="text-sm text-muted hover:text-ink">
        ← All submissions
      </Link>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{profile?.email ?? "Unknown user"}</h1>
        <span className="text-muted">{profile?.phone}</span>
        <span className="text-muted">
          {sub.submitted_at
            ? `Submitted ${when.format(new Date(sub.submitted_at))}`
            : `Uploaded ${when.format(new Date(sub.created_at))} · not paid yet`}
        </span>
        <span title={sub.paid_at ? `Paid ${when.format(new Date(sub.paid_at))}` : "No payment on record"}>
          <PaidPill paidAt={sub.paid_at} />
        </span>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
        <aside className="lg:sticky lg:top-6 space-y-4">
          <h2 className="font-bold">Their submission</h2>
          {media.length === 0 ? (
            <p className="rounded-2xl bg-line/60 p-5 text-muted">
              No files found for this submission.
            </p>
          ) : (
            media.map((m) => <Media key={m.url} {...m} />)
          )}
        </aside>

        <ReportEditor
          submissionId={id}
          initial={{
            markdown,
            audioPath,
            scores: scoresFromRow(report),
            publishedAt: report?.published_at ?? null,
            updatedAt: report?.updated_at ?? null,
          }}
          assets={assets}
        />
      </div>
    </div>
  );
}

function Media({ url, name }: { url: string; name: string }) {
  const isVideo = /\.(mp4|mov|webm|m4v)$/i.test(name);
  return (
    <figure className="overflow-hidden rounded-2xl border border-line bg-ink">
      {isVideo ? (
        <video src={url} controls playsInline preload="metadata" className="w-full max-h-[75vh] bg-ink" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
        <img src={url} alt={name} className="w-full max-h-[75vh] object-contain bg-ink" />
      )}
      <figcaption className="flex items-center justify-between bg-paper px-4 py-2 text-sm">
        <span className="truncate text-muted">{name}</span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-flame-deep">
          Open
        </a>
      </figcaption>
    </figure>
  );
}

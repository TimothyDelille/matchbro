import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Markdown from "@/components/Markdown";
import MediaCarousel from "@/components/MediaCarousel";
import { isAdmin } from "@/lib/admin-auth";
import { referencedAssets, signAssets, signSubmissionMedia } from "@/lib/report";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

export default function ReviewPage({ params }: PageProps<"/reviews/[id]">) {
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
        <Review params={params} />
      </Suspense>
    </main>
  );
}

async function Review({ params }: { params: PageProps<"/reviews/[id]">["params"] }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // Owners read through RLS (published reports only); admins can preview any report.
  const db = isAdmin(user) ? supabaseAdmin() : supabase;
  const { data: report } = await db
    .from("reports")
    .select("user_id, markdown, audio_path, published_at")
    .eq("submission_id", id)
    .maybeSingle();
  if (!report || (!report.published_at && !isAdmin(user))) notFound();

  // Their submitted files (same access rule: owner via RLS, or admin).
  const { data: sub } = await db.from("submissions").select("file_paths").eq("id", id).maybeSingle();

  const [assets, media] = await Promise.all([
    signAssets(report.user_id, id, referencedAssets(report.markdown, report.audio_path)),
    signSubmissionMedia(sub?.file_paths ?? []),
  ]);
  const audio = report.audio_path ? assets[report.audio_path] : null;

  return (
    <article className="mx-auto w-full max-w-3xl px-5 sm:px-8 py-2">
      <p className="text-muted">
        {report.published_at ? `Reviewed by Tim on ${dateFmt.format(new Date(report.published_at))}` : "Draft preview"}
      </p>
      
      <MediaCarousel items={media} />

      {audio && (
        <div className="mt-10 rounded-3xl bg-ink p-5 sm:p-6 text-paper">
          <p className="font-bold">Listen to the walkthrough</p>
          <audio src={audio} controls preload="metadata" className="mt-4 w-full" />
        </div>
      )}

      {report.markdown.trim() && (
        <div className="mt-10">
          <Markdown markdown={report.markdown} assets={assets} />
        </div>
      )}
    </article>
  );
}

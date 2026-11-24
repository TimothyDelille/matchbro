import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import AdminHeader from "@/components/admin/AdminHeader";
import PaidPill from "@/components/admin/PaidPill";
import { accountLabel } from "@/lib/guest";

type Row = {
  id: string;
  user_id: string;
  status: "uploading" | "queued" | "reviewing" | "done";
  /** Set when the submission is queued (on payment); null while still unpaid. */
  submitted_at: string | null;
  created_at: string;
  paid_at: string | null;
  total_bytes: number;
  file_paths: string[];
  unlock_required: boolean;
};

const when = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Los_Angeles",
});

export default function AdminPage() {
  return (
    <main className="flex-1 flex flex-col">
      <AdminHeader />
      <section className="mx-auto w-full max-w-5xl px-5 sm:px-8 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-5xl font-extrabold tracking-[-0.04em] leading-none">Submissions</h1>
          <Link
            href="/admin/profile-maker"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-ink"
          >
            🎨 Profile maker
          </Link>
        </div>
        <Suspense fallback={<p className="mt-10 text-muted">Loading…</p>}>
          <Submissions />
        </Suspense>
      </section>
    </main>
  );
}

async function Submissions() {
  await connection();
  await requireAdmin();
  const db = supabaseAdmin();

  const { data } = await db
    .from("submissions")
    .select("id, user_id, status, submitted_at, created_at, paid_at, total_bytes, file_paths, unlock_required")
    .in("status", ["uploading", "queued", "reviewing", "done"])
    .order("created_at", { ascending: true });
  // "uploading" = files sent but not paid yet. Skip ones with no files (swept/abandoned).
  const rows = ((data ?? []) as Row[])
    .filter((r) => r.status !== "uploading" || r.file_paths.length > 0)
    .sort((a, b) => sortTime(a) - sortTime(b));

  // Free follow-up questions waiting for an answer, oldest first.
  const { data: questions } = await db
    .from("follow_ups")
    .select("submission_id, user_id, question, created_at")
    .is("answered_at", null)
    .order("created_at", { ascending: true });

  const ids = [...new Set([...rows.map((r) => r.user_id), ...(questions ?? []).map((q) => q.user_id)])];
  const { data: profiles } = ids.length
    ? await db.from("profiles").select("id, email, phone").in("id", ids)
    : { data: [] };
  const who = new Map((profiles ?? []).map((p) => [p.id, p]));

  const open = rows.filter((r) => r.status === "queued" || r.status === "reviewing");
  const unpaid = rows.filter((r) => r.status === "uploading").reverse();
  const done = rows.filter((r) => r.status === "done").reverse();

  return (
    <>
      <Questions questions={questions ?? []} who={who} />
      <Group title="To review" empty="Nothing waiting. Nice." rows={open} who={who} />
      <Group title="Unpaid" empty="No unpaid submissions." rows={unpaid} who={who} />
      <Group title="Reviewed" empty="No reviews published yet." rows={done} who={who} />
    </>
  );
}

function Group({
  title,
  empty,
  rows,
  who,
}: {
  title: string;
  empty: string;
  rows: Row[];
  who: Map<string, { email: string; phone: string | null }>;
}) {
  return (
    <div className="mt-12">
      <h2 className="text-xl font-bold">
        {title} <span className="text-muted font-medium">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-muted">{empty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {rows.map((r) => {
            const p = who.get(r.user_id);
            return (
              <li key={r.id}>
                <Link
                  href={`/admin/submissions/${r.id}`}
                  className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[9rem_1fr_auto_auto] items-center gap-x-4 gap-y-1 py-4 hover:bg-line/40 -mx-3 px-3 rounded-xl"
                >
                  <span className="text-muted tabular-nums">{when.format(new Date(r.submitted_at ?? r.created_at))}</span>
                  <span className="truncate font-semibold sm:order-none order-first col-span-3 sm:col-span-1">
                    {accountLabel(p?.email)}
                    <span className="ml-3 font-normal text-muted">{p?.phone}</span>
                  </span>
                  <PaidPill paidAt={r.paid_at} locked={r.unlock_required} />
                  <StatusPill status={r.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Questions({
  questions,
  who,
}: {
  questions: { submission_id: string; user_id: string; question: string; created_at: string }[];
  who: Map<string, { email: string; phone: string | null }>;
}) {
  if (questions.length === 0) return null;
  return (
    <div className="mt-12">
      <h2 className="text-xl font-bold">
        Follow-up questions <span className="text-muted font-medium">{questions.length}</span>
      </h2>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {questions.map((q) => (
          <li key={q.submission_id}>
            <Link
              href={`/admin/submissions/${q.submission_id}#follow-up`}
              className="grid grid-cols-[1fr_auto] sm:grid-cols-[9rem_1fr_auto] items-center gap-x-4 gap-y-1 py-4 hover:bg-line/40 -mx-3 px-3 rounded-xl"
            >
              <span className="text-muted tabular-nums">{when.format(new Date(q.created_at))}</span>
              <span className="min-w-0 sm:order-none order-first col-span-2 sm:col-span-1">
                <span className="block truncate font-semibold">{accountLabel(who.get(q.user_id)?.email)}</span>
                <span className="block truncate text-muted">{q.question}</span>
              </span>
              <span className="rounded-full bg-flame px-3 py-1 text-sm font-semibold text-paper">💬 Answer</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const sortTime = (r: Row) => new Date(r.submitted_at ?? r.created_at).getTime();

function StatusPill({ status }: { status: Row["status"] }) {
  const styles = {
    uploading: "border border-dashed border-muted text-muted",
    queued: "bg-flame text-paper",
    reviewing: "bg-butter text-ink",
    done: "bg-line text-muted",
  }[status];
  const label = { uploading: "In checkout", queued: "New", reviewing: "Draft", done: "Published" }[status];
  return <span className={`rounded-full px-3 py-1 text-sm font-semibold ${styles}`}>{label}</span>;
}


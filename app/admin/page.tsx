import { Suspense } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import AdminHeader from "@/components/admin/AdminHeader";
import PaidPill from "@/components/admin/PaidPill";

type Row = {
  id: string;
  user_id: string;
  status: "queued" | "reviewing" | "done";
  submitted_at: string;
  paid_at: string | null;
  total_bytes: number;
  file_paths: string[];
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
        <h1 className="text-5xl font-extrabold tracking-[-0.04em] leading-none">Submissions</h1>
        <Suspense fallback={<p className="mt-10 text-muted">Loading…</p>}>
          <Submissions />
        </Suspense>
      </section>
    </main>
  );
}

async function Submissions() {
  await requireAdmin();
  const db = supabaseAdmin();

  const { data } = await db
    .from("submissions")
    .select("id, user_id, status, submitted_at, paid_at, total_bytes, file_paths")
    .in("status", ["queued", "reviewing", "done"])
    .order("submitted_at", { ascending: true });
  const rows = (data ?? []) as Row[];

  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = ids.length
    ? await db.from("profiles").select("id, email, phone").in("id", ids)
    : { data: [] };
  const who = new Map((profiles ?? []).map((p) => [p.id, p]));

  const open = rows.filter((r) => r.status !== "done");
  const done = rows.filter((r) => r.status === "done").reverse();

  return (
    <>
      <Group title="To review" empty="Nothing waiting. Nice." rows={open} who={who} />
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
                  <span className="text-muted tabular-nums">{when.format(new Date(r.submitted_at))}</span>
                  <span className="truncate font-semibold sm:order-none order-first col-span-3 sm:col-span-1">
                    {p?.email ?? "Unknown user"}
                    <span className="ml-3 font-normal text-muted">{p?.phone}</span>
                  </span>
                  <PaidPill paidAt={r.paid_at} />
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

function StatusPill({ status }: { status: Row["status"] }) {
  const styles = {
    queued: "bg-flame text-paper",
    reviewing: "bg-butter text-ink",
    done: "bg-line text-muted",
  }[status];
  const label = { queued: "New", reviewing: "Draft", done: "Published" }[status];
  return <span className={`rounded-full px-3 py-1 text-sm font-semibold ${styles}`}>{label}</span>;
}


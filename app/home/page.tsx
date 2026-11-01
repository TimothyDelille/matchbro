import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import SubmitSheet from "@/components/SubmitSheet";
import { supabaseServer } from "@/lib/supabase/server";

type Submission = {
  id: string;
  status: "uploading" | "queued" | "reviewing" | "done" | "expired";
  submitted_at: string | null;
};

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default function Home() {
  return (
    <main className="flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-3xl px-5 sm:px-8 pt-6 flex items-center justify-between">
        <Link href="/" className="text-lg font-extrabold tracking-tight">
          matchbro.app 🔥
        </Link>
        <form action="/auth/signout" method="post">
          <button className="text-sm text-muted hover:text-ink">
            Sign out
          </button>
        </form>
      </header>

      <section className="mx-auto w-full max-w-3xl px-5 sm:px-8 py-14">
        <Suspense
          fallback={
            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-[-0.04em] leading-none">
              Your reviews
            </h1>
          }
        >
          <Reviews />
        </Suspense>
      </section>
    </main>
  );
}

async function Reviews() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data } = await supabase
    .from("submissions")
    .select("id, status, submitted_at")
    .in("status", ["queued", "reviewing", "done"])
    .order("submitted_at", { ascending: false });
  const submissions = (data ?? []) as Submission[];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-[-0.04em] leading-none">
          Your reviews
        </h1>
      </div>

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
                {s.submitted_at
                  ? dateFmt.format(new Date(s.submitted_at))
                  : "Just now"}
              </span>
              <Status id={s.id} status={s.status} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-center my-5"><SubmitSheet account={{ email: user.email ?? "" }} /></div>

    </>
  );
}

function Status({ id, status }: { id: string; status: Submission["status"] }) {
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
      Reviewed! 🔥
    </Link>
  );
}

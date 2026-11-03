import { Suspense } from "react";
import Link from "next/link";
import BeforeAfter from "@/components/BeforeAfter";
import SubmitSheet from "@/components/SubmitSheet";
import { currentUser } from "@/lib/supabase/server";

const pill = "rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:border-ink";

async function AccountLink() {
  const user = await currentUser();
  return (
    <Link href={user ? "/home" : "/signin"} className={pill}>
      {user ? "Your reviews" : "Sign in"}
    </Link>
  );
}

async function Submit() {
  const user = await currentUser();
  return <SubmitSheet account={user ? { email: user.email ?? "" } : undefined} />;
}

export default function Landing() {
  return (
    <main className="flex-1 flex flex-col overflow-x-clip">
      <header className="mx-auto w-full max-w-6xl px-5 sm:px-8 pt-6 flex items-center justify-between">
        <span className="text-lg font-extrabold tracking-tight">matchbro.app 🔥</span>
        <Suspense
          fallback={
            <Link href="/signin" className={pill}>
              Sign in
            </Link>
          }
        >
          <AccountLink />
        </Suspense>
      </header>

      <section className="mx-auto w-full max-w-6xl flex-1 px-5 sm:px-8 py-10 lg:py-0 grid lg:grid-cols-[1.25fr_1fr] items-center gap-10 lg:gap-6">
        <div className="text-center lg:text-left">
          <h1 className="font-extrabold tracking-[-0.045em] leading-[0.88] text-[clamp(3.25rem,11vw,6.75rem)]">
            No matches?
            <br />
            We know why
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted max-w-md mx-auto lg:mx-0">
            Send a screen recording of your profile and we&apos;ll tell you what&apos;s not working.<br/><br/>Actionable feedback that gets you matches.
          </p>
          <div className="mt-8">
            <Suspense fallback={<SubmitSheet />}>
              <Submit />
            </Suspense>
          </div>
        </div>

        <BeforeAfter />
      </section>
    </main>
  );
}

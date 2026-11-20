import { Suspense } from "react";
import Link from "next/link";
import BeforeAfter, { type LandingVariant } from "@/components/BeforeAfter";
import LandingView from "@/components/LandingView";
import SubmitSheet from "@/components/SubmitSheet";
import { currentUser } from "@/lib/supabase/server";
import { isDemoUser } from "@/lib/demo";

const pill =
  "inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-semibold hover:border-ink";
const CTA = "Get My Score";

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
  return <SubmitSheet onboarding label={CTA} account={user ? { email: user.email ?? "", demo: isDemoUser(user) } : undefined} />;
}

/** The landing page. `variant` only swaps the before/after photos (A/B test). */
export default function Landing({ variant }: { variant: LandingVariant }) {
  return (
    <main className="flex-1 flex flex-col overflow-x-clip">
      <header className="mx-auto w-full max-w-6xl px-5 sm:px-8 pt-[max(1.25rem,env(safe-area-inset-top))] flex items-center justify-between">
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

      <section className="mx-auto w-full max-w-6xl flex-1 px-5 sm:px-8 pt-9 pb-[max(2.5rem,env(safe-area-inset-bottom))] lg:py-0 grid lg:grid-cols-[1.2fr_1fr] items-center gap-12 lg:gap-6">
        <div className="text-center lg:text-left">
          <h1 className="font-extrabold tracking-[-0.045em] leading-[0.92] text-[clamp(2.6rem,11.5vw,4.75rem)] text-balance">
            What's your hinge score?
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-muted max-w-md mx-auto lg:mx-0 text-pretty">
            Get your score and a plan to improve your profile and get more likes.
          </p>
          <div className="mt-8">
            <Suspense fallback={<SubmitSheet onboarding label={CTA} />}>
              <Submit />
            </Suspense>
          </div>
        </div>

        <BeforeAfter variant={variant} />
      </section>
      <LandingView variant={variant} />
    </main>
  );
}

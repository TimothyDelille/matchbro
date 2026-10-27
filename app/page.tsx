import BeforeAfter from "@/components/BeforeAfter";
import SubmitSheet from "@/components/SubmitSheet";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col overflow-x-clip">
      <header className="mx-auto w-full max-w-6xl px-5 sm:px-8 pt-6">
        <span className="text-lg font-extrabold tracking-tight">hinge roast 🔥</span>
      </header>

      <section className="mx-auto w-full max-w-6xl flex-1 px-5 sm:px-8 py-10 lg:py-0 grid lg:grid-cols-[1.25fr_1fr] items-center gap-10 lg:gap-6">
        <div className="text-center lg:text-left">
          <h1 className="font-extrabold tracking-[-0.045em] leading-[0.88] text-[clamp(3.25rem,11vw,6.75rem)]">
            We roast
            <br />
            your profile.
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted max-w-md mx-auto lg:mx-0">
            Send a screen recording of your profile and a few chats. We&apos;ll tell you what&apos;s not working.
          </p>
          <div className="mt-8">
            <SubmitSheet />
          </div>
        </div>

        <BeforeAfter />
      </section>

      <footer className="mx-auto w-full max-w-6xl px-5 sm:px-8 py-6 text-sm text-muted">
        Not affiliated with Hinge or Match Group.
      </footer>
    </main>
  );
}

import { Suspense } from "react";
import Link from "next/link";
import SignInForm from "@/components/SignInForm";

export default function SignIn() {
  return (
    <main className="flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-6xl px-5 sm:px-8 pt-6">
        <Link href="/" className="text-lg font-extrabold tracking-tight">
          matchbro.app 🔥
        </Link>
      </header>
      <section className="flex-1 grid place-items-center px-5 py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-5xl font-extrabold tracking-[-0.04em] leading-none">Welcome back.</h1>
          <Suspense>
            <SignInForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

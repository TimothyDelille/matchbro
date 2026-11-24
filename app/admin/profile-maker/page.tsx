import { Suspense } from "react";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import AdminHeader from "@/components/admin/AdminHeader";
import ProfileMaker from "@/components/admin/ProfileMaker";

/** Build fake dating profiles (like the landing page's) and save them as images. */
export default function ProfileMakerPage() {
  return (
    <main className="flex-1 flex flex-col">
      <AdminHeader wide />
      <section className="mx-auto w-full max-w-7xl px-5 sm:px-8 py-10">
        <h1 className="text-5xl font-extrabold tracking-[-0.04em] leading-none">Profile maker</h1>
        <p className="mt-3 text-muted">
          Fake profiles in the landing page style. Add photos and prompts, then save as PNG or JPG.
        </p>
        <Suspense fallback={<p className="mt-10 text-muted">Loading…</p>}>
          <Gate />
        </Suspense>
      </section>
    </main>
  );
}

async function Gate() {
  await connection();
  await requireAdmin();
  return <ProfileMaker />;
}

import Link from "next/link";
import SignOutForm from "@/components/SignOutForm";

export default function AdminHeader({ wide = false }: { wide?: boolean }) {
  return (
    <header className={`mx-auto w-full ${wide ? "max-w-7xl" : "max-w-5xl"} px-5 sm:px-8 pt-6 flex items-center justify-between`}>
      <Link href="/admin" className="text-lg font-extrabold tracking-tight">
        matchbro.app 🔥 <span className="ml-1 rounded-md bg-ink px-2 py-0.5 text-xs text-paper align-middle">admin</span>
      </Link>
      <SignOutForm>
        <button className="text-sm text-muted hover:text-ink">Sign out</button>
      </SignOutForm>
    </header>
  );
}

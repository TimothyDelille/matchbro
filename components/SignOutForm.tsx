"use client";

import type { ReactNode } from "react";
import { clearLocalState } from "@/lib/onboarding";

/** Posts to /auth/signout after wiping what this browser remembered, so the next visit starts from zero. */
export default function SignOutForm({ next, className, children }: { next?: string; className?: string; children: ReactNode }) {
  return (
    <form action="/auth/signout" method="post" className={className} onSubmit={clearLocalState}>
      {next && <input type="hidden" name="next" value={next} />}
      {children}
    </form>
  );
}

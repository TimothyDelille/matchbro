import type { Metadata } from "next";
import Landing from "@/components/Landing";

export const metadata: Metadata = { robots: { index: false } };

/** Girl-focused landing (A/B variant). Served at "/" for half of visitors via proxy.ts. */
export default function Page() {
  return <Landing variant="girl" />;
}

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { safeNextPath, signInUrl } from "@/lib/next-path";
import { isGuestEmail } from "@/lib/guest";

/** Keeps the Supabase session fresh and guards the signed-in pages. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(toSet, headers) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Signed out: sign in, then come back to the page they asked for (e.g. a review link).
  if (!user && ["/home", "/billing", "/reviews", "/roasts", "/admin"].some((p) => path.startsWith(p))) {
    return NextResponse.redirect(new URL(signInUrl(path + request.nextUrl.search), request.url));
  }
  // Already signed in: skip the form and go straight there. Guests (uploaded,
  // never paid) can still sign in to a real account.
  if (user && !isGuestEmail(user.email) && path.startsWith("/signin")) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(next ?? "/home", request.url));
  }

  if (path === "/") return landingSplit(request, response);

  return response;
}

const VARIANT_COOKIE = "lp_variant";

/**
 * Landing page A/B test: each visitor to "/" is assigned "guy" or "girl" once (sticky
 * cookie) and the girl half is rewritten to /g, so the URL stays "/".
 * Force one for testing with /?v=girl or /?v=guy.
 */
function landingSplit(request: NextRequest, response: NextResponse) {
  const forced = request.nextUrl.searchParams.get("v");
  const saved = request.cookies.get(VARIANT_COOKIE)?.value;
  // const variant =
  //   forced === "guy" || forced === "girl"
  //     ? forced
  //     : saved === "guy" || saved === "girl"
  //       ? saved
  //       : Math.random() < 0.5
  //         ? "guy"
  //         : "girl";
  const variant = "girl";

  let out = response;
  if (variant === "girl") {
    // Keep whatever the Supabase session refresh put on `response`.
    out = NextResponse.rewrite(new URL("/g", request.url), { request });
    response.cookies.getAll().forEach((c) => out.cookies.set(c));
    response.headers.forEach((v, k) => {
      const key = k.toLowerCase();
      if (key !== "set-cookie" && !key.startsWith("x-middleware")) out.headers.set(k, v);
    });
  }
  if (saved !== variant) {
    out.cookies.set(VARIANT_COOKIE, variant, { path: "/", maxAge: 60 * 60 * 24 * 60, sameSite: "lax" });
  }
  return out;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/capacity|api/stripe/webhook|ingest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

  if (!user && ["/home", "/reviews", "/roasts", "/admin"].some((p) => path.startsWith(p))) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }
  if (user && path.startsWith("/signin")) {
    return NextResponse.redirect(new URL("/home", request.url));
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
  const variant =
    forced === "guy" || forced === "girl"
      ? forced
      : saved === "guy" || saved === "girl"
        ? saved
        : Math.random() < 0.5
          ? "guy"
          : "girl";

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

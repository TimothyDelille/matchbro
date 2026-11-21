import type { NextConfig } from "next";

/** ffmpeg (recordings → frames) and Claude's instructions, for AI reviews. */
const aiReviewFiles = ["./node_modules/ffmpeg-static/ffmpeg", "./lib/ai-review/prompt.txt"];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Fonts read from disk when rendering report PDFs (lib/pdf).
  outputFileTracingIncludes: {
    "/api/admin/submissions/*/pdf": ["./lib/pdf/fonts/**/*"],
    // AI reviews (lib/ai-review) need these files. These routes can start a review:
    // wherever a Stripe payment is confirmed, plus the admin "AI draft".
    "/api/stripe/webhook": aiReviewFiles,
    "/api/submissions/*/checkout": aiReviewFiles,
    "/api/submissions/*/unlock": aiReviewFiles,
    "/api/admin/submissions/*/ai-review": aiReviewFiles,
    "/home": aiReviewFiles,
    "/reviews/*": aiReviewFiles,
  },
  // Loaded from node_modules at runtime instead of bundled (a native binary, and libheif's wasm).
  serverExternalPackages: ["ffmpeg-static", "heic-convert"],
  // PostHog via our own domain (see instrumentation-client.ts).
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },
  skipTrailingSlashRedirect: true,
  partialPrefetching: true,
  experimental: {
    agentUpgrade: "security",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

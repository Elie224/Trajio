import type { NextConfig } from "next";

// The CSP is built per request in src/middleware.ts: it carries a nonce, and
// Next.js reads it from the CSP of the request to stamp the scripts it
// injects. A static CSP here would override it and break the hydration.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // Always inlined at build time (default "false"), even when the variable is unset.
  env: {
    NEXT_PUBLIC_PASSWORD_RESET_ENABLED: process.env.NEXT_PUBLIC_PASSWORD_RESET_ENABLED ?? "false",
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Pages that may carry a secret token or an email in the URL: never leak it.
      ...["/reset-password", "/forgot-password"].map((source) => ({
        source,
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      })),
    ];
  },
  // Emits a self-contained .next/standalone server, used by the production image.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
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

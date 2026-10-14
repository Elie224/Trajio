import type { NextConfig } from "next";

import { resolveApiBaseUrl } from "./src/lib/env";

const isDev = process.env.NODE_ENV !== "production";

/** Origin of the FastAPI backend (validated in src/lib/env.ts, throws in production if invalid). */
function apiOrigin(): string {
  return new URL(resolveApiBaseUrl()).origin;
}

/** Raster tiles used by OSM_RASTER_STYLE (src/lib/map/style.ts). */
const TILE_HOSTS = ["https://tile.openstreetmap.org"];

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${TILE_HOSTS.join(" ")}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin()} ${TILE_HOSTS.join(" ")}${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
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

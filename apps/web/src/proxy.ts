import { NextResponse, type NextRequest } from "next/server";

/**
 * Content Security Policy.
 *
 * Next.js injects the React Server Components payload as inline scripts in
 * the prerendered HTML. A `script-src` without `'unsafe-inline'` blocks
 * them: React never hydrates and the whole site stays on its loading state.
 *
 * The pages of this application are statically prerendered, so the per
 * request nonce mechanism cannot be used: a nonce is applied during server
 * side rendering, and a prerendered page is built before any request
 * exists (see the Next.js documentation on Content Security Policy).
 *
 * The inline scripts are however deterministic for a given build. They are
 * therefore hashed after the build (scripts/build-csp.mjs) and the browser
 * is told to accept exactly those scripts, and nothing else. An injected
 * `<script>` has a different content, therefore a different hash, and is
 * refused by the browser.
 *
 * The hashes are per route: the payload of a page depends on that page.
 */

import { CSP_HASHES } from "@/lib/csp-hashes.generated";

const isDev = process.env.NODE_ENV !== "production";

/** Origins the browser may reach: the API and the map tiles. */
const TILE_HOSTS = ["https://tile.openstreetmap.org"];

/** The API origin, read from the public build-time variable. */
function apiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ?? "";
  if (raw === "") {
    // The build refuses to run without it in production (see next.config.ts).
    return isDev ? "http://localhost:8000" : "";
  }
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

/** The route of a request, normalised like the manifest keys. */
function routeOf(pathname: string): string {
  if (pathname === "/") return "/";
  const clean = pathname.replace(/\/+$/, "");
  return clean === "" ? "/" : clean;
}

/**
 * Builds the CSP of a request.
 *
 * In development the dev server needs `'unsafe-inline'` and `'unsafe-eval'`
 * (hot reload, source maps). In production the hashes of the inline
 * scripts of the route are used instead.
 */
export function buildCsp(pathname: string): string {
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : (() => {
        const hashes = CSP_HASHES[routeOf(pathname)];
        if (!hashes || hashes.length === 0) {
          // No hash known for this route: the scripts would be blocked and
          // the page would stay dead. The fallback keeps the site working.
          console.error(
            `CSP : aucun hash connu pour la route ${routeOf(pathname)}, ` +
              "reconstruction en mode permissif.",
          );
          return "script-src 'self' 'unsafe-inline'";
        }
        return `script-src 'self' ${hashes.join(" ")}`;
      })();

  const connectSrc = ["'self'", apiOrigin(), ...TILE_HOSTS, "https://data.geopf.fr"];
  if (isDev) {
    connectSrc.push("ws:", "wss:");
  }

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${TILE_HOSTS.join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const csp = buildCsp(request.nextUrl.pathname);

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // The CSP applies to every page, including the static ones.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

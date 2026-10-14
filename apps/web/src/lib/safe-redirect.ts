/**
 * Validation of the `?next=` parameter used after login.
 *
 * No blocklist: the value is resolved against the current origin with the URL
 * parser and only accepted if it stays on that origin. We then return the
 * normalised pathname + search, never the raw string.
 */

export const DEFAULT_AFTER_LOGIN = "/trips";

export function safeNextPath(
  raw: string | null | undefined,
  origin: string,
  fallback: string = DEFAULT_AFTER_LOGIN,
): string {
  if (!raw || raw[0] !== "/") return fallback;
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return fallback;
  }
  if (url.origin !== origin) return fallback;
  return url.pathname + url.search;
}

/** Login URL that brings the user back to `path` after authentication. */
export function loginHref(path: string | null | undefined): string {
  return path && path !== "/login" ? `/login?next=${encodeURIComponent(path)}` : "/login";
}

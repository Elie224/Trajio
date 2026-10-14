/**
 * Parsing of the HTTP `Retry-After` header (RFC 9110 §10.2.3).
 *
 * The value is either a number of seconds or an HTTP-date. Returns the delay
 * in seconds (>= 0), or null when the header is absent or unreadable.
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  // HTTP-date always carries a day/month name, e.g. "Wed, 21 Oct 2015 07:28:00 GMT".
  if (!/[A-Za-z]/.test(trimmed)) return null;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

/** Whole minutes to show to the user: ceil(seconds / 60), at least 1. */
export function retryAfterMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

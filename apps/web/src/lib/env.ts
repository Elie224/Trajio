/**
 * Runtime configuration shared by the whole web app.
 *
 * Only variables prefixed with NEXT_PUBLIC_ reach the browser, so nothing
 * sensitive may live here. Server-side secrets belong to the API, not to
 * Next.js.
 */

function readPublicUrl(value: string | undefined, fallback: string): string {
  if (!value || value.trim() === "") {
    return fallback;
  }
  return value.replace(/\/$/, "");
}

export const env = {
  /** Base URL of the Trajio REST API, reachable from the browser. */
  apiBaseUrl: readPublicUrl(process.env.NEXT_PUBLIC_API_BASE_URL, "http://localhost:8000"),
  /** Short human name shown in the UI. */
  appName: "Trajio",
} as const;

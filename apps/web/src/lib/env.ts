/**
 * Runtime configuration shared by the whole web app.
 *
 * Only variables prefixed with NEXT_PUBLIC_ reach the browser, so nothing
 * sensitive may live here. Server-side secrets belong to the API, not to
 * Next.js.
 *
 * Single source of truth for the API base URL: next.config.ts imports
 * `resolveApiBaseUrl` too, so the CSP and the client always agree.
 */

const DEV_API_BASE_URL = "http://localhost:8000";

/**
 * Reads and validates the API base URL.
 *
 * In development a missing value falls back to localhost. In production a
 * missing or invalid value throws, so `next build` fails loudly instead of
 * shipping a bundle (and a CSP) pointing at localhost.
 */
export function resolveApiBaseUrl(
  value: string | undefined = process.env.NEXT_PUBLIC_API_BASE_URL,
  isProduction: boolean = process.env.NODE_ENV === "production",
): string {
  const raw = value?.trim() ?? "";
  if (raw === "") {
    if (isProduction) {
      throw new Error(
        "NEXT_PUBLIC_API_BASE_URL est obligatoire en production " +
          "(ex. https://api.trajio.fr). Definissez-la avant `next build`.",
      );
    }
    return DEV_API_BASE_URL;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`NEXT_PUBLIC_API_BASE_URL invalide : "${raw}" n'est pas une URL absolue.`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`NEXT_PUBLIC_API_BASE_URL invalide : protocole "${parsed.protocol}" non supporte.`);
  }
  return raw.replace(/\/+$/, "");
}

export const env = {
  /** Base URL of the Trajio REST API, reachable from the browser. */
  apiBaseUrl: resolveApiBaseUrl(),
  /** Short human name shown in the UI. */
  appName: "Trajio",
} as const;

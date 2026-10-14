/**
 * User-facing error messages (French), shared by forms and the header.
 */
import { ApiError } from "./api";

export const SERVICE_UNAVAILABLE_MESSAGE = "Service momentanément indisponible, réessayez dans un instant.";

/** Network failure (fetch TypeError: API down, offline, CORS) or server error (5xx). */
export function isServiceUnavailable(error: unknown): boolean {
  if (error instanceof ApiError) return error.status >= 500;
  return error instanceof TypeError;
}

/**
 * Message to display for an unexpected error: the "service unavailable" text
 * for network/5xx, the API's French `detail` when it has one, else `fallback`.
 * Raw technical messages ("Failed to fetch", "Request failed with status …")
 * never reach the user.
 */
export function userFacingError(error: unknown, fallback: string): string {
  if (isServiceUnavailable(error)) return SERVICE_UNAVAILABLE_MESSAGE;
  if (error instanceof ApiError && !error.message.startsWith("Request failed with status")) {
    return error.message;
  }
  return fallback;
}

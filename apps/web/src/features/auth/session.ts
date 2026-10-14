/**
 * Shared session lookup for the header widgets (nav + auth actions): one
 * /auth/me request per page load instead of one per component.
 */
import { fetchCurrentUser, isUnauthenticated, type UserProfile } from "@/lib/api";

let pending: Promise<UserProfile | null> | null = null;

/** Resolves to the user, to null when logged out (401), or rejects on other errors. */
export function getSession(): Promise<UserProfile | null> {
  if (!pending) {
    pending = fetchCurrentUser().catch((error: unknown) => {
      if (isUnauthenticated(error)) return null;
      pending = null; // network/server error: allow a retry later
      throw error;
    });
  }
  return pending;
}

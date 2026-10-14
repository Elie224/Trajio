/**
 * Shared session lookup for the header widgets (nav + auth actions): one
 * /auth/me request per page load instead of one per component.
 */
import { fetchCurrentUser, isUnauthenticated, type UserProfile } from "@/lib/api";
import { clearRecentSearches } from "@/lib/recent-searches";

let pending: Promise<UserProfile | null> | null = null;
const listeners = new Set<() => void>();

/** Called whenever the session may have changed (login, logout, deletion). */
export function onSessionChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

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

/** Forgets the cached session: call after login, logout or account deletion. */
export function resetSession(): void {
  pending = null;
  listeners.forEach((listener) => listener());
}

/** Logout / account deletion: drop the cached session and per-user local data. */
export function clearUserSessionData(): void {
  resetSession();
  clearRecentSearches();
}

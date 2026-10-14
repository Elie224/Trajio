/**
 * Small cross-page flags kept in sessionStorage.
 *
 * Standalone module so that pages can share a key without importing each
 * other's components.
 */

/** Set right before redirecting home after an account deletion. */
export const ACCOUNT_DELETED_FLAG = "trajio:account-deleted";

/** Set after a successful password reset, read once by the login page. */
export const PASSWORD_RESET_FLAG = "trajio:password-reset";

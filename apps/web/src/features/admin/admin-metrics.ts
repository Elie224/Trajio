/**
 * Pure helpers for the administration dashboard.
 *
 * Kept free of React and of the API client so the rules they encode
 * (what a KPI means, which actions are allowed in which state) can be
 * unit tested.
 */

import type {
  AdminReport,
  AdminReportStatus,
  AdminStats,
  AdminUser,
  ReportReason,
  UserProfile,
} from "@/lib/api";

export type AdminUserStatus = UserProfile["status"];
export type AdminUserRole = UserProfile["role"];
export type IdentityStatus = AdminUser["id_document_status"];

/** A KPI displayed as a tile at the top of the dashboard. */
export type AdminKpi = {
  key: string;
  label: string;
  value: string;
  /** True when the tile carries an attention-worthy number (pending work). */
  isAlert: boolean;
};

/**
 * Builds the KPI tiles from the stats payload.
 *
 * `average_rating` is null until the first review: it is shown as "—" rather
 * than 0 so an empty platform is not read as a zero-star platform.
 */
export function buildKpis(stats: AdminStats): AdminKpi[] {
  return [
    {
      key: "users",
      label: "Utilisateurs",
      value: formatCount(stats.users_total),
      isAlert: false,
    },
    {
      key: "users_pending",
      label: "Comptes en attente",
      value: formatCount(stats.users_pending),
      isAlert: stats.users_pending > 0,
    },
    {
      key: "drivers",
      label: "Conducteurs",
      value: formatCount(stats.drivers_total),
      isAlert: false,
    },
    {
      key: "trips",
      label: "Trajets",
      value: formatCount(stats.trips_total),
      isAlert: false,
    },
    {
      key: "bookings",
      label: "Réservations",
      value: formatCount(stats.bookings_total),
      isAlert: false,
    },
    {
      key: "bookings_pending",
      label: "Réservations en attente",
      value: formatCount(stats.bookings_pending),
      isAlert: stats.bookings_pending > 0,
    },
    {
      key: "reports",
      label: "Signalements ouverts",
      value: formatCount(stats.open_reports),
      isAlert: stats.open_reports > 0,
    },
    {
      key: "rating",
      label: "Note moyenne",
      value: stats.average_rating === null ? "—" : formatRating(stats.average_rating),
      isAlert: false,
    },
  ];
}

/** French thousand separators (narrow no-break space, like the Intl format). */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("fr-FR").format(value);
}

/** One decimal, e.g. 4.25 -> "4,3". */
export function formatRating(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Statuses an administrator may set on a user account.
 *
 * `tone` is the semantic of the action: only "danger" is used to pick the
 * destructive button variant, the other two are regular actions.
 */
export const USER_STATUS_ACTIONS: ReadonlyArray<{
  status: AdminUserStatus;
  label: string;
  tone: "regular" | "danger";
}> = [
  { status: "active", label: "Réactiver", tone: "regular" },
  { status: "suspended", label: "Suspendre", tone: "regular" },
  { status: "banned", label: "Bannir", tone: "danger" },
];

/**
 * The status actions offered for a user.
 *
 * An administrator cannot change the status of an administrator account:
 * a suspended admin would lock the moderation queue out.
 */
export function availableStatusActions(user: AdminUser): typeof USER_STATUS_ACTIONS {
  if (user.role === "admin") return [];
  return USER_STATUS_ACTIONS.filter((action) => action.status !== user.status);
}

/** Identity decisions available for a driver identity document. */
export function availableIdentityActions(user: AdminUser): IdentityStatus[] {
  if (user.id_document_status === "verified") return ["rejected"];
  if (user.id_document_status === "rejected") return ["verified"];
  return ["verified", "rejected"];
}

/**
 * True when the account still has something to verify.
 *
 * Only drivers publish trips, so the identity document only matters for
 * them; a passenger account is never "pending verification" and an
 * administrator is not moderated here.
 */
export function needsIdentityReview(user: AdminUser): boolean {
  return user.role === "driver" && user.id_document_status === "pending";
}

/** The moderation outcomes an administrator can apply to a report. */
export function availableReportActions(report: AdminReport): AdminReportStatus[] {
  switch (report.status) {
    case "open":
      return ["reviewing", "resolved", "dismissed"];
    case "reviewing":
      return ["resolved", "dismissed"];
    default:
      return [];
  }
}

/** French label for a report status. */
export function reportStatusLabel(status: AdminReportStatus): string {
  switch (status) {
    case "open":
      return "Ouvert";
    case "reviewing":
      return "En cours de traitement";
    case "resolved":
      return "Résolu";
    case "dismissed":
      return "Classé sans suite";
  }
}

/** French label for a user status. */
export function userStatusLabel(status: AdminUserStatus): string {
  switch (status) {
    case "pending":
      return "En attente";
    case "active":
      return "Actif";
    case "suspended":
      return "Suspendu";
    case "banned":
      return "Banni";
  }
}

/** French label for a report reason. */
export function reportReasonLabel(reason: ReportReason): string {
  switch (reason) {
    case "safety":
      return "Sécurité";
    case "harassment":
      return "Harcèlement";
    case "no_show":
      return "Absent";
    case "vehicle":
      return "Véhicule";
    case "payment":
      return "Paiement";
    case "other":
      return "Autre";
  }
}

/**
 * Label of the user search field.
 *
 * The API matches the email, the name AND the phone number
 * (`build_user_filters` in app/services/admin.py). The label advertises
 * the phone search so the surface is not an unannounced enumeration
 * vector.
 */
export const USER_SEARCH_LABEL = "Recherche (nom, e-mail ou téléphone)";

/**
 * What a moderation panel should display after an action.
 *
 * The mutation and the refresh that follows are two separate operations:
 * if the mutation succeeded but the refresh failed, the administrator must
 * not be told the action failed — they would apply the same sanction twice.
 */
export type ActionOutcome =
  | { kind: "success"; notice: string }
  | { kind: "action-error"; message: string }
  | { kind: "refresh-error"; message: string };

/**
 * Builds the outcome of a moderation action.
 *
 * `actionError` is the message of the failed mutation (if any), `refreshError`
 * the one of the failed refresh (if any). They are never merged.
 */
export function buildActionOutcome(params: {
  successNotice: string;
  actionError: string | null;
  refreshError: string | null;
}): ActionOutcome {
  if (params.actionError !== null) {
    return { kind: "action-error", message: params.actionError };
  }
  if (params.refreshError !== null) {
    return {
      kind: "refresh-error",
      message:
        "L'action a été appliquée mais la liste n'a pas pu être actualisée. " + params.refreshError,
    };
  }
  return { kind: "success", notice: params.successNotice };
}

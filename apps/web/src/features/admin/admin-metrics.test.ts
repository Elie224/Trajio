import { describe, expect, it } from "vitest";

import type { AdminReport, AdminStats, AdminUser } from "@/lib/api";

import {
  availableIdentityActions,
  availableReportActions,
  availableStatusActions,
  buildKpis,
  formatCount,
  formatRating,
  matchesUserQuery,
  needsIdentityReview,
  reportStatusLabel,
  userStatusLabel,
} from "./admin-metrics";

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "u1",
    email: "ada@exemple.fr",
    first_name: "Ada",
    last_name: "Lovelace",
    phone: null,
    role: "driver",
    status: "active",
    email_verified_at: "2026-01-01T00:00:00Z",
    phone_verified_at: null,
    license_verified_at: null,
    id_document_status: "pending",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeReport(overrides: Partial<AdminReport> = {}): AdminReport {
  return {
    id: "r1",
    reporter_id: "u2",
    reported_user_id: "u3",
    booking_id: null,
    reason: "safety",
    details: null,
    status: "open",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const STATS: AdminStats = {
  users_total: 12,
  users_active: 8,
  users_pending: 2,
  drivers_total: 5,
  trips_total: 30,
  trips_scheduled: 4,
  bookings_total: 40,
  bookings_pending: 3,
  open_reports: 1,
  reviews_total: 9,
  average_rating: 4.25,
};

describe("buildKpis", () => {
  it("produit une tuile par indicateur", () => {
    const kpis = buildKpis(STATS);
    expect(kpis).toHaveLength(8);
    expect(kpis.map((kpi) => kpi.key)).toEqual([
      "users",
      "users_pending",
      "drivers",
      "trips",
      "bookings",
      "bookings_pending",
      "reports",
      "rating",
    ]);
  });

  it("signale les files d'attente comme alertes", () => {
    const kpis = buildKpis(STATS);
    const alerts = kpis.filter((kpi) => kpi.isAlert).map((kpi) => kpi.key);
    expect(alerts).toEqual(["users_pending", "bookings_pending", "reports"]);
  });

  it("n'alerte pas quand il n'y a rien à traiter", () => {
    const kpis = buildKpis({
      ...STATS,
      users_pending: 0,
      bookings_pending: 0,
      open_reports: 0,
    });
    expect(kpis.some((kpi) => kpi.isAlert)).toBe(false);
  });

  it("affiche un tiret et non zero quand la note moyenne est inconnue", () => {
    const kpis = buildKpis({ ...STATS, average_rating: null });
    const rating = kpis.find((kpi) => kpi.key === "rating");
    expect(rating?.value).toBe("—");
    expect(rating?.isAlert).toBe(false);
  });

  it("formate la note moyenne avec une décimale", () => {
    const kpis = buildKpis(STATS);
    expect(kpis.find((kpi) => kpi.key === "rating")?.value).toBe("4,3");
  });
});

describe("formatCount", () => {
  it("utilise le séparateur de milliers français", () => {
    expect(formatCount(1234)).toBe("1\u202f234");
    expect(formatCount(0)).toBe("0");
  });

  it("reste stable sur une valeur non finie", () => {
    expect(formatCount(Number.NaN)).toBe("0");
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe("0");
  });
});

describe("formatRating", () => {
  it("arrondit à une décimale", () => {
    expect(formatRating(4.25)).toBe("4,3");
    expect(formatRating(5)).toBe("5,0");
  });

  it("reste stable sur une valeur non finie", () => {
    expect(formatRating(Number.NaN)).toBe("—");
  });
});

describe("availableStatusActions", () => {
  it("propose toutes les transitions sauf l'état courant", () => {
    const actions = availableStatusActions(makeUser({ status: "active" }));
    expect(actions.map((action) => action.status)).toEqual(["suspended", "banned"]);
  });

  it("n'autorise aucune action sur un compte administrateur", () => {
    expect(availableStatusActions(makeUser({ role: "admin" }))).toEqual([]);
  });
});

describe("availableIdentityActions", () => {
  it("propose les deux décisions quand le document est en attente", () => {
    expect(availableIdentityActions(makeUser({ id_document_status: "pending" }))).toEqual([
      "verified",
      "rejected",
    ]);
  });

  it("ne propose que le refus quand le document est validé", () => {
    expect(availableIdentityActions(makeUser({ id_document_status: "verified" }))).toEqual([
      "rejected",
    ]);
  });

  it("ne propose que la validation quand le document a été refusé", () => {
    expect(availableIdentityActions(makeUser({ id_document_status: "rejected" }))).toEqual([
      "verified",
    ]);
  });
});

describe("needsIdentityReview", () => {
  it("vrai pour un conducteur en attente", () => {
    expect(needsIdentityReview(makeUser())).toBe(true);
  });

  it("faux pour un passager", () => {
    expect(needsIdentityReview(makeUser({ role: "passenger" }))).toBe(false);
  });

  it("faux pour un administrateur", () => {
    expect(needsIdentityReview(makeUser({ role: "admin" }))).toBe(false);
  });
});

describe("availableReportActions", () => {
  it("offre les trois issues pour un signalement ouvert", () => {
    expect(availableReportActions(makeReport({ status: "open" }))).toEqual([
      "reviewing",
      "resolved",
      "dismissed",
    ]);
  });

  it("offre seulement la clôture pour un signalement en cours", () => {
    expect(availableReportActions(makeReport({ status: "reviewing" }))).toEqual([
      "resolved",
      "dismissed",
    ]);
  });

  it("n'offre rien pour un signalement terminé", () => {
    expect(availableReportActions(makeReport({ status: "resolved" }))).toEqual([]);
    expect(availableReportActions(makeReport({ status: "dismissed" }))).toEqual([]);
  });
});

describe("libellés", () => {
  it("traduit les statuts de compte", () => {
    expect(userStatusLabel("pending")).toBe("En attente");
    expect(userStatusLabel("active")).toBe("Actif");
    expect(userStatusLabel("suspended")).toBe("Suspendu");
    expect(userStatusLabel("banned")).toBe("Banni");
  });

  it("traduit les statuts de signalement", () => {
    expect(reportStatusLabel("open")).toBe("Ouvert");
    expect(reportStatusLabel("reviewing")).toBe("En cours de traitement");
    expect(reportStatusLabel("resolved")).toBe("Résolu");
    expect(reportStatusLabel("dismissed")).toBe("Classé sans suite");
  });
});

describe("matchesUserQuery", () => {
  it("trouve par e-mail, sans tenir compte de la casse", () => {
    expect(matchesUserQuery(makeUser(), "ADA@EXEMPLE")).toBe(true);
  });

  it("trouve par nom", () => {
    expect(matchesUserQuery(makeUser(), "lovelace")).toBe(true);
  });

  it("ne trouve pas un terme absent", () => {
    expect(matchesUserQuery(makeUser(), "turing")).toBe(false);
  });

  it("correspond à tout quand la recherche est vide", () => {
    expect(matchesUserQuery(makeUser(), "   ")).toBe(true);
  });
});

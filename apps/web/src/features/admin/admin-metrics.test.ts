import { describe, expect, it } from "vitest";

import type { AdminReport, AdminStats, AdminUser } from "@/lib/api";

import {
  availableIdentityActions,
  availableReportActions,
  availableStatusActions,
  buildActionOutcome,
  buildKpis,
  formatCount,
  formatRating,
  needsIdentityReview,
  reportReasonLabel,
  reportStatusLabel,
  USER_SEARCH_LABEL,
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

describe("reportReasonLabel", () => {
  it("traduit chaque motif de signalement", () => {
    expect(reportReasonLabel("safety")).toBe("Sécurité");
    expect(reportReasonLabel("harassment")).toBe("Harcèlement");
    expect(reportReasonLabel("no_show")).toBe("Absent");
    expect(reportReasonLabel("vehicle")).toBe("Véhicule");
    expect(reportReasonLabel("payment")).toBe("Paiement");
    expect(reportReasonLabel("other")).toBe("Autre");
  });
});
describe("buildActionOutcome", () => {
  it("renvoie le succes quand tout s'est bien passe", () => {
    const outcome = buildActionOutcome({
      successNotice: "Compte suspendu.",
      actionError: null,
      refreshError: null,
    });
    expect(outcome).toEqual({ kind: "success", notice: "Compte suspendu." });
  });

  it("isole l'echec de l'action de celui du rafraichissement", () => {
    const outcome = buildActionOutcome({
      successNotice: "Compte suspendu.",
      actionError: "Le changement de statut a echoue.",
      refreshError: null,
    });
    expect(outcome.kind).toBe("action-error");
    expect(outcome.kind === "action-error" && outcome.message).toBe(
      "Le changement de statut a echoue.",
    );
  });

  it("annonce que l'action a passe quand seul le rafraichissement echoue", () => {
    // C'est le point critique : dire "l'action a echoue" alors qu'elle a
    // reussi invite l'administrateur a re-appliquer la meme sanction.
    const outcome = buildActionOutcome({
      successNotice: "Compte suspendu.",
      actionError: null,
      refreshError: "Le service est indisponible.",
    });
    expect(outcome.kind).toBe("refresh-error");
    expect(outcome.kind === "refresh-error" && outcome.message).toContain(
      "L'action a été appliquée",
    );
    expect(outcome.kind === "refresh-error" && outcome.message).toContain(
      "Le service est indisponible.",
    );
  });

  it("ne montre jamais un succes quand l'action a echoue", () => {
    const outcome = buildActionOutcome({
      successNotice: "Compte suspendu.",
      actionError: "Echec.",
      refreshError: "Echec du rafraichissement.",
    });
    expect(outcome.kind).not.toBe("success");
  });
});
describe("USER_SEARCH_LABEL", () => {
  it("annonce la recherche par téléphone, que l'API accepte", () => {
    // L'API filtre sur le nom, l'e-mail ET le téléphone
    // (build_user_filters dans app/services/admin.py). Le libellé doit
    // annoncer cette surface, sinon c'est une énumération non documentée.
    expect(USER_SEARCH_LABEL).toContain("téléphone");
    expect(USER_SEARCH_LABEL).toContain("e-mail");
  });
});
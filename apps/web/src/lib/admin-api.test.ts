/**
 * Contract tests of the administration API client.
 *
 * The moderation surface is the most contract-sensitive code of the web app:
 * a wrong path, a renamed query parameter or a body field that does not
 * match the Pydantic schema silently breaks the dashboard (the action looks
 * like it worked, or it returns a 422 the user cannot interpret).
 *
 * These tests pin the wire format the client speaks, so a change on the API
 * side (or in api.ts) that breaks the contract fails here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  fetchAdminReports,
  fetchAdminStats,
  fetchAdminUsers,
  updateAdminReportStatus,
  updateAdminUserIdentity,
  updateAdminUserStatus,
  type AdminReport,
  type AdminStats,
  type AdminUser,
} from "./api";

/** The base URL the client uses; the paths are asserted relatively to it. */
const BASE = "http://localhost:8000";

type Call = { url: string; init: RequestInit };

let calls: Call[] = [];

/** Installs a fetch stub answering the given payload (or error). */
function stubFetch(handler: (url: string, init: RequestInit) => Response): void {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : String(input);
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  });
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
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
  reviews_total: 7,
  average_rating: 4.5,
};

const USER: AdminUser = {
  id: "11111111-1111-1111-1111-111111111111",
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
};

const REPORT: AdminReport = {
  id: "22222222-2222-2222-2222-222222222222",
  reporter_id: "33333333-3333-3333-3333-333333333333",
  reported_user_id: "44444444-4444-4444-4444-444444444444",
  booking_id: null,
  reason: "safety",
  details: null,
  status: "open",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

/** The path and the query string of the last call. */
function lastCall(): Call {
  const call = calls[calls.length - 1];
  if (!call) throw new Error("no call was recorded");
  return call;
}

/** The path and the query of the last call, split. */
function lastPath(): { path: string; params: URLSearchParams } {
  const url = new URL(lastCall().url);
  return { path: url.pathname, params: url.searchParams };
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchAdminStats", () => {
  it("appelle GET /api/v1/admin/stats", async () => {
    stubFetch(() => jsonResponse(STATS));

    const stats = await fetchAdminStats();

    expect(stats).toEqual(STATS);
    expect(lastPath().path).toBe("/api/v1/admin/stats");
    expect(lastCall().init.method ?? "GET").toBe("GET");
  });

  it("envoie le signal d'annulation au client HTTP", async () => {
    stubFetch(() => jsonResponse(STATS));
    const controller = new AbortController();

    await fetchAdminStats(controller.signal);

    expect(lastCall().init.signal).toBe(controller.signal);
  });

  it("remonte une ApiError portant le statut et le message de l'API", async () => {
    stubFetch(() => jsonResponse({ detail: "Accès réservé aux administrateurs." }, 403));

    await expect(fetchAdminStats()).rejects.toBeInstanceOf(ApiError);
    await expect(fetchAdminStats()).rejects.toMatchObject({
      status: 403,
      message: "Accès réservé aux administrateurs.",
    });
  });

  it("remonte le délai Retry-After quand l'API limite la surface", async () => {
    stubFetch(() => jsonResponse({ detail: "Trop de requêtes." }, 429, { "Retry-After": "42" }));

    await expect(fetchAdminStats()).rejects.toMatchObject({
      status: 429,
      retryAfter: 42,
    });
  });
});

describe("fetchAdminUsers", () => {
  it("appelle GET /api/v1/admin/users sans query quand aucun filtre n'est pose", async () => {
    stubFetch(() => jsonResponse({ items: [USER], total: 1 }));

    const response = await fetchAdminUsers();

    expect(response).toEqual({ items: [USER], total: 1 });
    expect(lastPath().path).toBe("/api/v1/admin/users");
    expect(lastPath().params.toString()).toBe("");
  });

  it("envoie les filtres avec les noms de parametres de l'API", async () => {
    stubFetch(() => jsonResponse({ items: [], total: 0 }));

    await fetchAdminUsers({
      status: "suspended",
      role: "driver",
      query: "ada",
      limit: 20,
      offset: 40,
    });

    const { path, params } = lastPath();
    expect(path).toBe("/api/v1/admin/users");
    expect(params.get("status")).toBe("suspended");
    expect(params.get("role")).toBe("driver");
    expect(params.get("query")).toBe("ada");
    expect(params.get("limit")).toBe("20");
    expect(params.get("offset")).toBe("40");
  });

  it("encode les caracteres reserves de la recherche", async () => {
    stubFetch(() => jsonResponse({ items: [], total: 0 }));

    await fetchAdminUsers({ query: "a b&c=d" });

    expect(lastPath().params.get("query")).toBe("a b&c=d");
  });

  it("omet les filtres vides plutot que de les envoyer a vide", async () => {
    stubFetch(() => jsonResponse({ items: [], total: 0 }));

    await fetchAdminUsers({ status: undefined, role: undefined, query: "" });

    const { params } = lastPath();
    expect(params.has("status")).toBe(false);
    expect(params.has("role")).toBe(false);
    expect(params.has("query")).toBe(false);
  });

  it("envoie limit=0 quand la pagination demande une page vide", async () => {
    // `limit` is only omitted when undefined: 0 is a meaningful value and the
    // API rejects it with a 422. The client must not silently hide it.
    stubFetch(() => jsonResponse({ items: [], total: 0 }));

    await fetchAdminUsers({ limit: 0 });

    expect(lastPath().params.get("limit")).toBe("0");
  });
});

describe("fetchAdminReports", () => {
  it("appelle GET /api/v1/admin/reports", async () => {
    stubFetch(() => jsonResponse({ items: [REPORT], total: 1 }));

    const response = await fetchAdminReports();

    expect(response).toEqual({ items: [REPORT], total: 1 });
    expect(lastPath().path).toBe("/api/v1/admin/reports");
  });

  it("envoie le filtre de statut et la pagination", async () => {
    stubFetch(() => jsonResponse({ items: [], total: 0 }));

    await fetchAdminReports({ status: "reviewing", limit: 10, offset: 20 });

    const { path, params } = lastPath();
    expect(path).toBe("/api/v1/admin/reports");
    expect(params.get("status")).toBe("reviewing");
    expect(params.get("limit")).toBe("10");
    expect(params.get("offset")).toBe("20");
  });
});

describe("updateAdminUserStatus", () => {
  it("PATCH /api/v1/admin/users/{id}/status avec le champ status", async () => {
    stubFetch(() => jsonResponse({ ...USER, status: "banned" }));

    const updated = await updateAdminUserStatus(USER.id, "banned");

    expect(updated.status).toBe("banned");
    const { path } = lastPath();
    expect(path).toBe(`/api/v1/admin/users/${USER.id}/status`);
    expect(lastCall().init.method).toBe("PATCH");
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ status: "banned" });
  });

  it("declare le type de contenu JSON", async () => {
    stubFetch(() => jsonResponse(USER));

    await updateAdminUserStatus(USER.id, "suspended");

    const headers = lastCall().init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("remonte le conflit 409 quand l'administrateur sanctionne un autre admin", async () => {
    stubFetch(() =>
      jsonResponse(
        { detail: "Un administrateur ne peut pas sanctionner un autre administrateur." },
        409,
      ),
    );

    await expect(updateAdminUserStatus(USER.id, "banned")).rejects.toMatchObject({
      status: 409,
      message: "Un administrateur ne peut pas sanctionner un autre administrateur.",
    });
  });

  it("remonte le 422 quand le statut n'est pas une sanction valide", async () => {
    stubFetch(() => jsonResponse({ detail: "Statut de compte invalide." }, 422));

    await expect(updateAdminUserStatus(USER.id, "pending" as never)).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe("updateAdminUserIdentity", () => {
  it("PATCH /api/v1/admin/users/{id}/identity avec le champ id_document_status", async () => {
    stubFetch(() => jsonResponse({ ...USER, id_document_status: "verified" }));

    const updated = await updateAdminUserIdentity(USER.id, "verified");

    expect(updated.id_document_status).toBe("verified");
    expect(lastPath().path).toBe(`/api/v1/admin/users/${USER.id}/identity`);
    expect(lastCall().init.method).toBe("PATCH");
    // The field name must stay `id_document_status`: the API schema uses it.
    expect(JSON.parse(String(lastCall().init.body))).toEqual({
      id_document_status: "verified",
    });
  });

  it("remonte le 409 quand la decision d'identite est refusee", async () => {
    stubFetch(() => jsonResponse({ detail: "Décision d'identité refusée." }, 409));

    await expect(updateAdminUserIdentity(USER.id, "rejected")).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("updateAdminReportStatus", () => {
  it("PATCH /api/v1/admin/reports/{id} avec le champ status", async () => {
    stubFetch(() => jsonResponse({ ...REPORT, status: "resolved" }));

    const updated = await updateAdminReportStatus(REPORT.id, "resolved");

    expect(updated.status).toBe("resolved");
    expect(lastPath().path).toBe(`/api/v1/admin/reports/${REPORT.id}`);
    expect(lastCall().init.method).toBe("PATCH");
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ status: "resolved" });
  });

  it("remonte le 404 quand le signalement a disparu", async () => {
    stubFetch(() => jsonResponse({ detail: "Signalement introuvable." }, 404));

    await expect(updateAdminReportStatus(REPORT.id, "dismissed")).rejects.toMatchObject({
      status: 404,
      message: "Signalement introuvable.",
    });
  });
});

describe("base URL et credentials", () => {
  it("appelle la base de l'API configuree, jamais une URL relative", async () => {
    stubFetch(() => jsonResponse(STATS));

    await fetchAdminStats();

    expect(lastCall().url.startsWith(BASE)).toBe(true);
  });

  it("envoie les cookies de session sur chaque appel", async () => {
    stubFetch(() => jsonResponse(STATS));

    await fetchAdminStats();

    expect(lastCall().init.credentials).toBe("include");
  });
});

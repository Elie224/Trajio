import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCurrentUser = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, fetchCurrentUser: () => fetchCurrentUser() };
});

import { ApiError } from "@/lib/api";
import { RECENT_SEARCHES_KEY } from "@/lib/recent-searches";

import { clearUserSessionData, getSession, resetSession } from "./session";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

const USER = { id: "u1", first_name: "Ada" };

describe("session", () => {
  beforeEach(() => {
    resetSession();
    fetchCurrentUser.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("partage une seule requete /auth/me", async () => {
    fetchCurrentUser.mockResolvedValue(USER);
    await Promise.all([getSession(), getSession()]);
    expect(fetchCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("renvoie null sur 401", async () => {
    fetchCurrentUser.mockRejectedValue(new ApiError("Non authentifié", 401));
    await expect(getSession()).resolves.toBeNull();
  });

  it("resetSession force une nouvelle requete (apres connexion)", async () => {
    fetchCurrentUser.mockRejectedValueOnce(new ApiError("Non authentifié", 401));
    await expect(getSession()).resolves.toBeNull();
    fetchCurrentUser.mockResolvedValueOnce(USER);
    resetSession();
    await expect(getSession()).resolves.toEqual(USER);
    expect(fetchCurrentUser).toHaveBeenCalledTimes(2);
  });

  it("autorise un nouvel essai apres une erreur reseau", async () => {
    fetchCurrentUser.mockRejectedValueOnce(new Error("Failed to fetch"));
    await expect(getSession()).rejects.toThrow("Failed to fetch");
    fetchCurrentUser.mockResolvedValueOnce(USER);
    await expect(getSession()).resolves.toEqual(USER);
  });

  it("clearUserSessionData vide le cache et l'historique de recherche", async () => {
    const storage = memoryStorage();
    storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([{ pickup: "A", dropoff: "B" }]));
    vi.stubGlobal("window", { localStorage: storage });
    fetchCurrentUser.mockResolvedValue(USER);
    await getSession();

    clearUserSessionData();

    expect(storage.data.has(RECENT_SEARCHES_KEY)).toBe(false);
    await getSession();
    expect(fetchCurrentUser).toHaveBeenCalledTimes(2);
  });
});

describe("onSessionChange", () => {
  it("previent les abonnes a chaque resetSession, jusqu'au desabonnement", async () => {
    const { onSessionChange } = await import("./session");
    const listener = vi.fn();
    const unsubscribe = onSessionChange(listener);
    resetSession();
    expect(listener).toHaveBeenCalledTimes(1);
    clearUserSessionData();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    resetSession();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

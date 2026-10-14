import { describe, expect, it } from "vitest";

import { ApiError } from "./api";
import { SERVICE_UNAVAILABLE_MESSAGE, isServiceUnavailable, userFacingError } from "./errors";

describe("isServiceUnavailable", () => {
  it.each([
    [new TypeError("Failed to fetch"), true],
    [new ApiError("Internal Server Error", 500), true],
    [new ApiError("Service Unavailable", 503), true],
    [new ApiError("Non authentifié.", 401), false],
    [new ApiError("Requête invalide", 422), false],
    [new Error("autre"), false],
    ["texte", false],
  ])("%s -> %s", (error, expected) => {
    expect(isServiceUnavailable(error)).toBe(expected);
  });
});

describe("userFacingError", () => {
  it("remplace les erreurs reseau et 5xx par le message de service indisponible", () => {
    expect(userFacingError(new TypeError("Failed to fetch"), "x")).toBe(SERVICE_UNAVAILABLE_MESSAGE);
    expect(userFacingError(new ApiError("boom", 500), "x")).toBe(SERVICE_UNAVAILABLE_MESSAGE);
    expect(userFacingError(new ApiError("boom", 503), "x")).toBe(SERVICE_UNAVAILABLE_MESSAGE);
  });

  it("garde le detail francais de l'API", () => {
    expect(userFacingError(new ApiError("Identifiants invalides.", 401), "x")).toBe("Identifiants invalides.");
  });

  it("n'affiche jamais un message technique", () => {
    expect(userFacingError(new ApiError("Request failed with status 422", 422), "Données invalides.")).toBe(
      "Données invalides.",
    );
    expect(userFacingError(new Error("weird"), "Erreur.")).toBe("Erreur.");
  });
});

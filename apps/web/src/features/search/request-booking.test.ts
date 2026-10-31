import { beforeEach, describe, expect, it, vi } from "vitest";

const createBooking = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, createBooking: (...args: unknown[]) => createBooking(...args) };
});

import { ApiError } from "@/lib/api";
import { SERVICE_UNAVAILABLE_MESSAGE } from "@/lib/errors";

import { requestBooking } from "./request-booking";

describe("requestBooking", () => {
  beforeEach(() => {
    createBooking.mockReset();
  });

  it("envoie une réservation avec le trajet et le nombre de places", async () => {
    createBooking.mockResolvedValue({ id: "b1" });
    const result = await requestBooking("trip-42", 2);
    expect(createBooking).toHaveBeenCalledWith({ tripId: "trip-42", requestedSeats: 2 });
    expect(result).toEqual({
      status: "success",
      message: "Réservation envoyée au conducteur.",
    });
  });

  it("affiche le détail API en cas d'échec métier", async () => {
    createBooking.mockRejectedValue(new ApiError("Plus assez de places.", 409));
    await expect(requestBooking("trip-42", 1)).resolves.toEqual({
      status: "error",
      message: "Plus assez de places.",
    });
  });

  it("masque les pannes réseau derrière le message de service", async () => {
    createBooking.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(requestBooking("trip-42", 1)).resolves.toEqual({
      status: "error",
      message: SERVICE_UNAVAILABLE_MESSAGE,
    });
  });
});

import { createBooking } from "@/lib/api";
import { userFacingError } from "@/lib/errors";

export type BookingRequestResult =
  | { status: "success"; message: string }
  | { status: "error"; message: string };

/** Creates a booking from search results and maps API failures to French copy. */
export async function requestBooking(
  tripId: string,
  requestedSeats: number,
): Promise<BookingRequestResult> {
  try {
    await createBooking({ tripId, requestedSeats });
    return { status: "success", message: "Réservation envoyée au conducteur." };
  } catch (error: unknown) {
    return {
      status: "error",
      message: userFacingError(error, "Impossible de créer la réservation."),
    };
  }
}

/**
 * Thin, typed client over the Trajio REST API.
 *
 * Deliberately dependency-free: fetch is enough today, and a generated client
 * can replace this module later without touching any component.
 */

import { env } from "./env";

export type HealthPayload = {
  status: string;
  service: string;
  version: string;
  // Omitted by the API in production.
  environment?: string;
  timestamp: string;
};

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(env.apiBaseUrl + path, {
    cache: "no-store",
    credentials: "include",
    ...init,
  });

  if (!response.ok) {
    let message = "Request failed with status " + response.status;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) {
        message = body.detail;
      }
    } catch {
      // Ignore JSON parsing errors: keep generic message.
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

export async function fetchApiHealth(signal?: AbortSignal): Promise<HealthPayload> {
  return fetchJson<HealthPayload>("/health", { signal });
}

export type UserProfile = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: "passenger" | "driver" | "admin";
  status: "pending" | "active" | "suspended" | "banned";
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RegisterPayload = {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
};

// Identical whether or not the email already exists (anti-enumeration).
export type RegisterResult = {
  message: string;
  verification_required: boolean;
};

export async function register(payload: RegisterPayload): Promise<RegisterResult> {
  return fetchJson<RegisterResult>("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: payload.email,
      first_name: payload.firstName,
      last_name: payload.lastName,
      password: payload.password,
    }),
  });
}

export async function verifyEmail(token: string): Promise<{ message: string }> {
  return fetchJson<{ message: string }>("/api/v1/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

export async function login(email: string, password: string): Promise<UserProfile> {
  return fetchJson<UserProfile>("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(): Promise<{ message: string }> {
  return fetchJson<{ message: string }>("/api/v1/auth/logout", {
    method: "POST",
  });
}

export async function exportMyData(): Promise<Record<string, unknown>> {
  return fetchJson<Record<string, unknown>>("/api/v1/auth/me/export");
}

export async function deleteAccount(): Promise<{ message: string }> {
  return fetchJson<{ message: string }>("/api/v1/auth/me", { method: "DELETE" });
}

export async function fetchCurrentUser(): Promise<UserProfile> {
  return fetchJson<UserProfile>("/api/v1/auth/me");
}

export async function updateProfile(payload: {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
}): Promise<UserProfile> {
  return fetchJson<UserProfile>("/api/v1/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(payload.firstName !== undefined ? { first_name: payload.firstName } : {}),
      ...(payload.lastName !== undefined ? { last_name: payload.lastName } : {}),
      ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
    }),
  });
}

export type Vehicle = {
  id: string;
  owner_id: string;
  brand: string;
  model: string;
  color: string | null;
  plate: string;
  seats_total: number;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function fetchVehicles(): Promise<Vehicle[]> {
  return fetchJson<Vehicle[]>("/api/v1/vehicles");
}

export async function createVehicle(payload: {
  brand: string;
  model: string;
  color?: string;
  plate: string;
  seatsTotal: number;
  isPrimary: boolean;
}): Promise<Vehicle> {
  return fetchJson<Vehicle>("/api/v1/vehicles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brand: payload.brand,
      model: payload.model,
      color: payload.color ?? null,
      plate: payload.plate,
      seats_total: payload.seatsTotal,
      is_primary: payload.isPrimary,
    }),
  });
}

export async function deactivateVehicle(vehicleId: string): Promise<{ message: string }> {
  return fetchJson<{ message: string }>(`/api/v1/vehicles/${vehicleId}`, {
    method: "DELETE",
  });
}

export type Trip = {
  id: string;
  driver_id: string;
  vehicle_id: string;
  origin_label: string;
  destination_label: string;
  origin_lat: number;
  origin_lng: number;
  destination_lat: number;
  destination_lng: number;
  departure_time: string;
  seats_total: number;
  seats_available: number;
  is_paid: boolean;
  price_per_seat_cents: number | null;
  max_detour_ratio: number;
  driver_preferences: string | null;
  comments: string | null;
  status: "scheduled" | "cancelled" | "completed";
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TripCreatePayload = {
  vehicleId: string;
  originLabel: string;
  destinationLabel: string;
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  departureTime: string;
  seatsTotal: number;
  isPaid: boolean;
  pricePerSeatCents: number | null;
  maxDetourRatio: number;
  driverPreferences?: string;
  comments?: string;
};

export async function createTrip(payload: TripCreatePayload): Promise<Trip> {
  return fetchJson<Trip>("/api/v1/trips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vehicle_id: payload.vehicleId,
      origin_label: payload.originLabel,
      destination_label: payload.destinationLabel,
      origin_lat: payload.originLat,
      origin_lng: payload.originLng,
      destination_lat: payload.destinationLat,
      destination_lng: payload.destinationLng,
      departure_time: payload.departureTime,
      seats_total: payload.seatsTotal,
      is_paid: payload.isPaid,
      price_per_seat_cents: payload.pricePerSeatCents,
      max_detour_ratio: payload.maxDetourRatio,
      driver_preferences: payload.driverPreferences ?? null,
      comments: payload.comments ?? null,
    }),
  });
}

export async function fetchMyTrips(): Promise<Trip[]> {
  return fetchJson<Trip[]>("/api/v1/trips/mine");
}

export async function cancelTrip(tripId: string): Promise<{ message: string }> {
  return fetchJson<{ message: string }>(`/api/v1/trips/${tripId}/cancel`, {
    method: "POST",
  });
}

export type SearchTrip = {
  id: string;
  driver_id: string;
  driver_name: string;
  vehicle_label: string;
  origin_label: string;
  destination_label: string;
  origin_lat: number;
  origin_lng: number;
  destination_lat: number;
  destination_lng: number;
  departure_time: string;
  seats_available: number;
  is_paid: boolean;
  price_per_seat_cents: number | null;
  max_detour_ratio: number;
  match_score: number;
  match_reasons: string[];
  match_breakdown: {
    proximity: number;
    detour: number;
    schedule: number;
    direction: number;
    seats: number;
  };
};

export type BookingStatus = "pending" | "accepted" | "declined" | "cancelled";

export type Booking = {
  id: string;
  trip_id: string;
  passenger_id: string;
  requested_seats: number;
  message: string | null;
  status: BookingStatus;
  responded_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  trip_origin_label: string;
  trip_destination_label: string;
  trip_departure_time: string;
  driver_id: string;
  driver_name: string;
  passenger_name: string;
};

export type BookingCreated = {
  id: string;
  trip_id: string;
  passenger_id: string;
  requested_seats: number;
  message: string | null;
  status: BookingStatus;
  responded_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

type SearchTripsResponse = {
  items: SearchTrip[];
  total: number;
};

type BookingListResponse = {
  items: Booking[];
  total: number;
};

export async function searchTrips(params: {
  originQuery?: string;
  destinationQuery?: string;
  date?: string;
  earliestTime?: string;
  passengers?: number;
  maxPriceCents?: number;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
}): Promise<SearchTripsResponse> {
  const query = new URLSearchParams();
  if (params.originQuery) query.set("origin_query", params.originQuery);
  if (params.destinationQuery) query.set("destination_query", params.destinationQuery);
  if (params.date) query.set("date", params.date);
  if (params.earliestTime) query.set("earliest_time", params.earliestTime);
  if (params.passengers) query.set("passengers", String(params.passengers));
  if (params.maxPriceCents !== undefined) query.set("max_price_cents", String(params.maxPriceCents));
  if (params.pickupLat !== undefined) query.set("pickup_lat", String(params.pickupLat));
  if (params.pickupLng !== undefined) query.set("pickup_lng", String(params.pickupLng));
  if (params.dropoffLat !== undefined) query.set("dropoff_lat", String(params.dropoffLat));
  if (params.dropoffLng !== undefined) query.set("dropoff_lng", String(params.dropoffLng));

  const suffix = query.toString() ? "?" + query.toString() : "";
  return fetchJson<SearchTripsResponse>("/api/v1/search/trips" + suffix);
}

export async function createBooking(payload: {
  tripId: string;
  requestedSeats: number;
  message?: string;
}): Promise<BookingCreated> {
  return fetchJson<BookingCreated>("/api/v1/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trip_id: payload.tripId,
      requested_seats: payload.requestedSeats,
      message: payload.message?.trim() || null,
    }),
  });
}

export async function fetchMyBookings(): Promise<Booking[]> {
  const response = await fetchJson<BookingListResponse>("/api/v1/bookings/mine");
  return response.items;
}

export async function fetchIncomingBookings(): Promise<Booking[]> {
  const response = await fetchJson<BookingListResponse>("/api/v1/bookings/incoming");
  return response.items;
}

export async function acceptBooking(bookingId: string): Promise<{ message: string }> {
  return fetchJson<{ message: string }>(`/api/v1/bookings/${bookingId}/accept`, {
    method: "POST",
  });
}

export async function declineBooking(bookingId: string): Promise<{ message: string }> {
  return fetchJson<{ message: string }>(`/api/v1/bookings/${bookingId}/decline`, {
    method: "POST",
  });
}

export async function cancelBooking(bookingId: string): Promise<{ message: string }> {
  return fetchJson<{ message: string }>(`/api/v1/bookings/${bookingId}/cancel`, {
    method: "POST",
  });
}

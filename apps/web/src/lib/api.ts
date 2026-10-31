/**
 * Thin, typed client over the Trajio REST API.
 *
 * Deliberately dependency-free: fetch is enough today, and a generated client
 * can replace this module later without touching any component.
 */

import { env } from "./env";
import { parseRetryAfter } from "./retry-after";

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
  /** Seconds from the Retry-After header, or null if absent/unreadable. */
  readonly retryAfter: number | null;

  constructor(message: string, status: number, retryAfter: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** True when the API answered 401 (no or expired session). */
export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
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
    throw new ApiError(message, response.status, parseRetryAfter(response.headers.get("Retry-After")));
  }

  if (response.status === 204) {
    return undefined as T;
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
  phone_verified_at: string | null;
  license_verified_at: string | null;
  id_document_status: "pending" | "verified" | "rejected";
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

/** Re-authenticated deletion: the password is sent in the body, never stored. */
export async function deleteAccount(password: string): Promise<{ message: string } | undefined> {
  return fetchJson<{ message: string } | undefined>("/api/v1/auth/me", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

/** Counts of what a deletion would cancel. The endpoint may not exist yet. */
export async function fetchDeletionPreview(): Promise<unknown> {
  return fetchJson<unknown>("/api/v1/auth/me/deletion-preview");
}

/** Always answers the same generic message; the dev-only reset_token is dropped here. */
export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  const body = await fetchJson<{ message: string; reset_token?: string | null }>(
    "/api/v1/auth/forgot-password",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    },
  );
  return { message: body.message };
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  return fetchJson<{ message: string }>("/api/v1/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
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

export type ConversationPeer = {
  id: string;
  first_name: string;
  last_name: string;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type ConversationSummary = {
  id: string;
  booking_id: string;
  trip_id: string;
  trip_origin_label: string;
  trip_destination_label: string;
  booking_status: string;
  can_send: boolean;
  peer: ConversationPeer;
  last_message: ChatMessage | null;
  unread_count: number;
  updated_at: string;
};

export type ConversationDetail = ConversationSummary & {
  messages: ChatMessage[];
};

export type Review = {
  id: string;
  booking_id: string;
  trip_id: string;
  author_id: string;
  subject_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type ReportReason = "safety" | "harassment" | "no_show" | "vehicle" | "payment" | "other";

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const response = await fetchJson<{ items: ConversationSummary[] }>("/api/v1/messages/conversations");
  return response.items;
}

export async function openConversation(bookingId: string): Promise<ConversationDetail> {
  return fetchJson<ConversationDetail>("/api/v1/messages/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ booking_id: bookingId }),
  });
}

export async function fetchConversation(conversationId: string): Promise<ConversationDetail> {
  return fetchJson<ConversationDetail>(`/api/v1/messages/conversations/${conversationId}`);
}

export async function sendMessage(conversationId: string, body: string): Promise<ChatMessage> {
  return fetchJson<ChatMessage>(`/api/v1/messages/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

export async function markConversationRead(conversationId: string): Promise<{ message: string }> {
  return fetchJson<{ message: string }>(`/api/v1/messages/conversations/${conversationId}/read`, {
    method: "POST",
  });
}

export async function fetchMyReviews(): Promise<Review[]> {
  const response = await fetchJson<{ items: Review[] }>("/api/v1/reviews/mine");
  return response.items;
}

export async function createReview(payload: {
  bookingId: string;
  rating: number;
  comment?: string;
}): Promise<Review> {
  return fetchJson<Review>("/api/v1/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      booking_id: payload.bookingId,
      rating: payload.rating,
      comment: payload.comment?.trim() || null,
    }),
  });
}

export async function createReport(payload: {
  reportedUserId: string;
  reason: ReportReason;
  bookingId?: string;
  details?: string;
}): Promise<unknown> {
  return fetchJson<unknown>("/api/v1/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reported_user_id: payload.reportedUserId,
      reason: payload.reason,
      booking_id: payload.bookingId ?? null,
      details: payload.details?.trim() || null,
    }),
  });
}

export async function blockUser(userId: string): Promise<unknown> {
  return fetchJson<unknown>("/api/v1/blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
}

/* -------------------------------------------------------------------------
 * Administration (role `admin`).
 * The API answers 403 to a non-admin; the dashboard hides itself in that case.
 * ---------------------------------------------------------------------- */

export type AdminStats = {
  users_total: number;
  users_active: number;
  users_pending: number;
  drivers_total: number;
  trips_total: number;
  trips_scheduled: number;
  bookings_total: number;
  bookings_pending: number;
  open_reports: number;
  reviews_total: number;
  /** Null until at least one review exists. */
  average_rating: number | null;
};

export type AdminUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: "passenger" | "driver" | "admin";
  status: "pending" | "active" | "suspended" | "banned";
  email_verified_at: string | null;
  phone_verified_at: string | null;
  license_verified_at: string | null;
  id_document_status: "pending" | "verified" | "rejected";
  created_at: string;
};

export type AdminReportStatus = "open" | "reviewing" | "resolved" | "dismissed";

export type AdminReport = {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  booking_id: string | null;
  reason: ReportReason;
  details: string | null;
  status: AdminReportStatus;
  created_at: string;
  updated_at: string;
};

export async function fetchAdminStats(signal?: AbortSignal): Promise<AdminStats> {
  return fetchJson<AdminStats>("/api/v1/admin/stats", { signal });
}

export async function fetchAdminUsers(params: {
  status?: UserProfile["status"];
  role?: UserProfile["role"];
  query?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ items: AdminUser[]; total: number }> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.role) query.set("role", params.role);
  if (params.query) query.set("query", params.query);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const suffix = query.toString() ? "?" + query.toString() : "";
  return fetchJson<{ items: AdminUser[]; total: number }>("/api/v1/admin/users" + suffix);
}

export async function fetchAdminReports(params: {
  status?: AdminReportStatus;
  limit?: number;
  offset?: number;
} = {}): Promise<{ items: AdminReport[]; total: number }> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const suffix = query.toString() ? "?" + query.toString() : "";
  return fetchJson<{ items: AdminReport[]; total: number }>("/api/v1/admin/reports" + suffix);
}

export async function updateAdminReportStatus(
  reportId: string,
  status: AdminReportStatus,
): Promise<AdminReport> {
  return fetchJson<AdminReport>(`/api/v1/admin/reports/${reportId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function updateAdminUserStatus(
  userId: string,
  status: UserProfile["status"],
): Promise<AdminUser> {
  return fetchJson<AdminUser>(`/api/v1/admin/users/${userId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function updateAdminUserIdentity(
  userId: string,
  idDocumentStatus: AdminUser["id_document_status"],
): Promise<AdminUser> {
  return fetchJson<AdminUser>(`/api/v1/admin/users/${userId}/identity`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_document_status: idDocumentStatus }),
  });
}

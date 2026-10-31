"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { ServiceError } from "@/components/ui/ServiceError";
import { SessionStatus } from "@/features/auth/SessionStatus";
import { useSession } from "@/features/auth/useSession";
import { userFacingError } from "@/lib/errors";
import {
  acceptBooking,
  cancelBooking,
  cancelTrip,
  createReview,
  createVehicle,
  declineBooking,
  fetchIncomingBookings,
  fetchMyBookings,
  fetchMyReviews,
  deactivateVehicle,
  fetchMyTrips,
  fetchVehicles,
  type Booking,
  type Review,
  type Trip,
  type Vehicle,
} from "@/lib/api";

type Tab = "profile" | "vehicles" | "trips" | "bookings";

type DashboardData = {
  vehicles: Vehicle[];
  trips: Trip[];
  bookings: Booking[];
  incomingBookings: Booking[];
  reviews: Review[];
};

type DataState =
  | { status: "loading"; loadKey: number }
  | { status: "ready"; loadKey: number; data: DashboardData }
  | { status: "error"; loadKey: number; message: string };

/** DataState without its load key, so a reload can tag the result. */
type LoadedData = DataState extends infer State
  ? State extends { loadKey: number }
    ? Omit<State, "loadKey">
    : never
  : never;

const TABS: { id: Tab; label: string }[] = [
  { id: "profile", label: "Profil" },
  { id: "vehicles", label: "Véhicules" },
  { id: "trips", label: "Trajets" },
  { id: "bookings", label: "Réservations et avis" },
];

export function AccountDashboard() {
  const session = useSession();
  const [tab, setTab] = useState<Tab>("profile");
  const [dataState, setDataState] = useState<DataState>({ status: "loading", loadKey: 0 });
  const [isSubmittingVehicle, setIsSubmittingVehicle] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Incremented to trigger a reload; each load is tagged with the key it belongs
  // to so a stale result is never shown.
  const [loadKey, setLoadKey] = useState(0);

  const loadData = async (): Promise<LoadedData> => {
    try {
      const [vehicles, trips, bookings, incomingBookings, reviews] = await Promise.all([
        fetchVehicles(),
        fetchMyTrips(),
        fetchMyBookings(),
        fetchIncomingBookings(),
        fetchMyReviews(),
      ]);
      return { status: "ready", data: { vehicles, trips, bookings, incomingBookings, reviews } };
    } catch (error: unknown) {
      return {
        status: "error",
        message: userFacingError(error, "Impossible de charger votre espace."),
      };
    }
  };

  useEffect(() => {
    if (session.status !== "authenticated") return;
    let cancelled = false;
    void loadData().then((nextState) => {
      if (!cancelled) setDataState({ ...nextState, loadKey });
    });
    return () => {
      cancelled = true;
    };
  }, [session.status, loadKey]);

  const refresh = async () => {
    const nextState = await loadData();
    setDataState({ ...nextState, loadKey });
  };

  if (session.status !== "authenticated") {
    return (
      <SessionStatus
        session={session}
        loadingLabel="Chargement de votre espace…"
        anonymousBody="Connectez-vous pour gérer votre profil, vos véhicules et vos trajets."
        showSignup
      />
    );
  }

  if (dataState.status === "loading" || dataState.loadKey !== loadKey) {
    return (
      <section className="page-section">
        <Container>Chargement de votre espace…</Container>
      </section>
    );
  }

  if (dataState.status === "error") {
    return (
      <section className="page-section">
        <Container className="max-w-xl">
          <Card>
            <CardTitle>Erreur</CardTitle>
            <ServiceError
              className="mt-3"
              message={dataState.message}
              onRetry={() => {
                setLoadKey((key) => key + 1);
              }}
            />
          </Card>
        </Container>
      </section>
    );
  }

  const { data } = dataState;
  const user = session.user;

  return (
    <section className="page-section">
      <Container className="grid gap-5">
        <div>
          <h1 className="text-2xl font-semibold text-page-text">Mes trajets</h1>
          <p className="mt-1 text-sm text-page-muted">
            Gérez votre profil, vos véhicules, vos trajets et vos réservations.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Sections du compte"
          className="flex flex-wrap gap-1 rounded-full bg-brand-50 p-1"
        >
          {TABS.map((item) => {
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`dashboard-tab-${item.id}`}
                aria-selected={selected}
                aria-controls={`dashboard-panel-${item.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(item.id)}
                className={
                  "min-h-11 rounded-full px-4 text-sm font-medium " +
                  (selected ? "bg-primary-strong text-white" : "text-page-muted hover:text-page-text")
                }
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {tab === "profile" && (
          <div role="tabpanel" id="dashboard-panel-profile" aria-labelledby="dashboard-tab-profile">
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <CardTitle>Mon profil</CardTitle>
                <Badge tone={user.email_verified_at ? "success" : "warning"}>
                  {user.email_verified_at ? "Email vérifié" : "Email non vérifié"}
                </Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-page-muted">Nom</dt>
                  <dd className="font-medium text-page-text">
                    {user.first_name} {user.last_name}
                  </dd>
                </div>
                <div>
                  <dt className="text-page-muted">Email</dt>
                  <dd className="font-medium text-page-text">{user.email}</dd>
                </div>
                <div>
                  <dt className="text-page-muted">Rôle</dt>
                  <dd className="font-medium text-page-text">{user.role}</dd>
                </div>
                <div>
                  <dt className="text-page-muted">Statut</dt>
                  <dd className="font-medium text-page-text">{user.status}</dd>
                </div>
              </dl>
            </Card>
          </div>
        )}

        {tab === "vehicles" && (
          <div
            role="tabpanel"
            id="dashboard-panel-vehicles"
            aria-labelledby="dashboard-tab-vehicles"
            className="grid gap-5"
          >
            <Card>
              <CardTitle>Ajouter un véhicule</CardTitle>
              <form
                className="mt-4 grid gap-3 sm:grid-cols-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setMessage(null);
                  setIsSubmittingVehicle(true);
                  const formData = new FormData(event.currentTarget);
                  try {
                    await createVehicle({
                      brand: String(formData.get("brand") ?? ""),
                      model: String(formData.get("model") ?? ""),
                      color: String(formData.get("color") ?? ""),
                      plate: String(formData.get("plate") ?? ""),
                      seatsTotal: Number(formData.get("seats_total") ?? 4),
                      isPrimary: formData.get("is_primary") === "on",
                    });
                    setMessage("Véhicule enregistré.");
                    await refresh();
                    event.currentTarget.reset();
                  } catch (error: unknown) {
                    setMessage(userFacingError(error, "Impossible d'ajouter le véhicule."));
                  } finally {
                    setIsSubmittingVehicle(false);
                  }
                }}
              >
                <div>
                  <label htmlFor="vehicle-brand" className="label">
                    Marque
                  </label>
                  <input id="vehicle-brand" name="brand" className="field" required />
                </div>
                <div>
                  <label htmlFor="vehicle-model" className="label">
                    Modèle
                  </label>
                  <input id="vehicle-model" name="model" className="field" required />
                </div>
                <div>
                  <label htmlFor="vehicle-color" className="label">
                    Couleur
                  </label>
                  <input id="vehicle-color" name="color" className="field" />
                </div>
                <div>
                  <label htmlFor="vehicle-plate" className="label">
                    Immatriculation
                  </label>
                  <input id="vehicle-plate" name="plate" className="field" required />
                </div>
                <div>
                  <label htmlFor="vehicle-seats" className="label">
                    Places
                  </label>
                  <input
                    id="vehicle-seats"
                    name="seats_total"
                    className="field"
                    type="number"
                    min={2}
                    max={9}
                    defaultValue={4}
                    required
                  />
                </div>
                <label className="flex min-h-11 items-center gap-2 text-sm text-page-text">
                  <input type="checkbox" name="is_primary" />
                  Véhicule principal
                </label>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={isSubmittingVehicle} className="w-full">
                    {isSubmittingVehicle ? "Enregistrement..." : "Ajouter le véhicule"}
                  </Button>
                </div>
                {message && <p className="sm:col-span-2 text-sm text-page-muted">{message}</p>}
              </form>
            </Card>

            <Card>
              <CardTitle>Mes véhicules</CardTitle>
              {data.vehicles.length === 0 ? (
                <CardBody>Aucun véhicule enregistré pour le moment.</CardBody>
              ) : (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {data.vehicles.map((vehicle) => (
                    <li key={vehicle.id} className="rounded-xl border border-page-border bg-brand-50 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-page-text">
                            {vehicle.brand} {vehicle.model}
                          </p>
                          <p className="text-sm text-page-muted">
                            {vehicle.plate} · {vehicle.seats_total} places
                          </p>
                        </div>
                        {vehicle.is_primary && <Badge tone="success">Principal</Badge>}
                      </div>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={async () => {
                            await deactivateVehicle(vehicle.id);
                            await refresh();
                          }}
                          className="min-h-11 text-sm font-medium text-danger hover:text-red-800"
                        >
                          Désactiver
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {tab === "trips" && (
          <div role="tabpanel" id="dashboard-panel-trips" aria-labelledby="dashboard-tab-trips">
            <Card>
              <CardTitle>Mes trajets publiés</CardTitle>
              {data.trips.length === 0 ? (
                <CardBody>Aucun trajet publié pour le moment.</CardBody>
              ) : (
                <ul className="mt-4 space-y-3">
                  {data.trips.map((trip) => (
                    <li key={trip.id} className="rounded-xl border border-page-border bg-brand-50 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-page-text">
                            {trip.origin_label} → {trip.destination_label}
                          </p>
                          <p className="text-sm text-page-muted">
                            {new Date(trip.departure_time).toLocaleString("fr-FR")} · {trip.seats_available}/
                            {trip.seats_total} places
                          </p>
                          <p className="text-xs text-page-muted">
                            {trip.is_paid ? `${((trip.price_per_seat_cents ?? 0) / 100).toFixed(2)} €` : "Gratuit"}
                          </p>
                        </div>
                        <Badge tone={trip.status === "scheduled" ? "success" : "warning"}>{trip.status}</Badge>
                      </div>
                      {trip.status === "scheduled" && (
                        <div className="mt-3">
                          <button
                            type="button"
                            className="min-h-11 text-sm font-medium text-danger hover:text-red-800"
                            onClick={async () => {
                              await cancelTrip(trip.id);
                              await refresh();
                            }}
                          >
                            Annuler ce trajet
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {tab === "bookings" && (
          <div
            role="tabpanel"
            id="dashboard-panel-bookings"
            aria-labelledby="dashboard-tab-bookings"
            className="grid gap-5"
          >
            <Card>
              <CardTitle>Mes réservations passager</CardTitle>
              {data.bookings.length === 0 ? (
                <CardBody>Aucune réservation en cours.</CardBody>
              ) : (
                <ul className="mt-4 space-y-3">
                  {data.bookings.map((booking) => (
                    <li key={booking.id} className="rounded-xl border border-page-border bg-brand-50 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-page-text">
                            {booking.trip_origin_label} → {booking.trip_destination_label}
                          </p>
                          <p className="text-sm text-page-muted">
                            {new Date(booking.trip_departure_time).toLocaleString("fr-FR")} ·{" "}
                            {booking.requested_seats} place(s)
                          </p>
                          <p className="text-xs text-page-muted">Conducteur: {booking.driver_name}</p>
                        </div>
                        <Badge tone={booking.status === "accepted" ? "success" : "warning"}>
                          {booking.status}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3">
                        {(booking.status === "pending" || booking.status === "accepted") && (
                          <>
                            <Link
                              href={`/messages?booking=${booking.id}`}
                              className="inline-flex min-h-11 items-center text-sm font-medium text-primary-strong"
                            >
                              Écrire
                            </Link>
                            <button
                              type="button"
                              className="min-h-11 text-sm font-medium text-danger hover:text-red-800"
                              onClick={async () => {
                                await cancelBooking(booking.id);
                                await refresh();
                              }}
                            >
                              Annuler ma réservation
                            </button>
                          </>
                        )}
                      </div>
                      {canReviewBooking(booking, data.reviews) && (
                        <ReviewForm
                          bookingId={booking.id}
                          onSaved={async () => { await refresh(); }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardTitle>Demandes reçues sur mes trajets</CardTitle>
              {data.incomingBookings.length === 0 ? (
                <CardBody>Aucune demande reçue pour le moment.</CardBody>
              ) : (
                <ul className="mt-4 space-y-3">
                  {data.incomingBookings.map((booking) => (
                    <li key={booking.id} className="rounded-xl border border-page-border bg-brand-50 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-page-text">
                            {booking.trip_origin_label} → {booking.trip_destination_label}
                          </p>
                          <p className="text-sm text-page-muted">
                            {booking.passenger_name} · {booking.requested_seats} place(s)
                          </p>
                          <p className="text-xs text-page-muted">
                            Départ: {new Date(booking.trip_departure_time).toLocaleString("fr-FR")}
                          </p>
                        </div>
                        <Badge tone={booking.status === "accepted" ? "success" : "warning"}>
                          {booking.status}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3">
                        {(booking.status === "pending" || booking.status === "accepted") && (
                          <Link
                            href={`/messages?booking=${booking.id}`}
                            className="inline-flex min-h-11 items-center text-sm font-medium text-primary-strong"
                          >
                            Écrire
                          </Link>
                        )}
                        {booking.status === "pending" && (
                          <>
                            <button
                              type="button"
                              className="min-h-11 text-sm font-medium text-emerald-700 hover:text-emerald-800"
                              onClick={async () => {
                                await acceptBooking(booking.id);
                                await refresh();
                              }}
                            >
                              Accepter
                            </button>
                            <button
                              type="button"
                              className="min-h-11 text-sm font-medium text-danger hover:text-red-800"
                              onClick={async () => {
                                await declineBooking(booking.id);
                                await refresh();
                              }}
                            >
                              Refuser
                            </button>
                          </>
                        )}
                      </div>
                      {canReviewBooking(booking, data.reviews) && (
                        <ReviewForm
                          bookingId={booking.id}
                          onSaved={async () => { await refresh(); }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </Container>
    </section>
  );
}

function canReviewBooking(booking: Booking, reviews: Review[]) {
  if (booking.status !== "accepted") return false;
  if (new Date(booking.trip_departure_time).getTime() > Date.now()) return false;
  return !reviews.some((review) => review.booking_id === booking.id);
}

function ReviewForm({ bookingId, onSaved }: { bookingId: string; onSaved: () => Promise<void> }) {
  return (
    <form
      className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_auto]"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await createReview({
          bookingId,
          rating: Number(form.get("rating") ?? 5),
          comment: String(form.get("comment") ?? ""),
        });
        await onSaved();
      }}
    >
      <label className="text-sm text-page-muted">
        Note
        <select name="rating" className="field mt-1" defaultValue="5" aria-label="Note">
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>
              {value}/5
            </option>
          ))}
        </select>
      </label>
      <input name="comment" className="field" placeholder="Commentaire (optionnel)" maxLength={500} />
      <Button type="submit" variant="secondary">
        Publier l’avis
      </Button>
    </form>
  );
}

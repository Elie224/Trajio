"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { loginHref } from "@/lib/safe-redirect";
import {
  acceptBooking,
  cancelBooking,
  cancelTrip,
  createVehicle,
  declineBooking,
  fetchIncomingBookings,
  fetchMyBookings,
  deactivateVehicle,
  fetchCurrentUser,
  fetchMyTrips,
  fetchVehicles,
  isUnauthenticated,
  type Booking,
  type Trip,
  type UserProfile,
  type Vehicle,
} from "@/lib/api";

type LoadState =
  | { status: "loading" }
  | { status: "anonymous" }
  | {
      status: "ready";
      user: UserProfile;
      vehicles: Vehicle[];
      trips: Trip[];
      bookings: Booking[];
      incomingBookings: Booking[];
    }
  | { status: "error"; message: string };

export function AccountDashboard() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const pathname = usePathname();
  const [isSubmittingVehicle, setIsSubmittingVehicle] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = async (): Promise<LoadState> => {
    try {
      const user = await fetchCurrentUser();
      const [vehicles, trips, bookings, incomingBookings] = await Promise.all([
        fetchVehicles(),
        fetchMyTrips(),
        fetchMyBookings(),
        fetchIncomingBookings(),
      ]);
      return { status: "ready", user, vehicles, trips, bookings, incomingBookings };
    } catch (error: unknown) {
      if (isUnauthenticated(error)) {
        return { status: "anonymous" };
      }
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Erreur inattendue.",
      };
    }
  };

  useEffect(() => {
    let cancelled = false;
    void loadData().then((nextState) => {
      if (!cancelled) {
        setState(nextState);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <section className="page-section">
        <Container>Chargement de votre espace…</Container>
      </section>
    );
  }

  if (state.status === "anonymous") {
    return (
      <section className="page-section">
        <Container className="max-w-xl">
          <Card>
            <CardTitle>Connexion requise</CardTitle>
            <CardBody>Connectez-vous pour gérer votre profil, vos véhicules et vos trajets.</CardBody>
            <div className="mt-4 flex gap-2">
              <Link
                href={loginHref(pathname)}
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Se connecter
              </Link>
              <Link
                href="/signup"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Créer un compte
              </Link>
            </div>
          </Card>
        </Container>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="page-section">
        <Container className="max-w-xl">
          <Card>
            <CardTitle>Erreur</CardTitle>
            <CardBody>{state.message}</CardBody>
          </Card>
        </Container>
      </section>
    );
  }

  return (
    <section className="page-section">
      <Container className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <CardTitle>Mon profil</CardTitle>
            <Badge tone={state.user.email_verified_at ? "success" : "warning"}>
              {state.user.email_verified_at ? "Email vérifié" : "Email non vérifié"}
            </Badge>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Nom</dt>
              <dd className="font-medium text-slate-900">
                {state.user.first_name} {state.user.last_name}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium text-slate-900">{state.user.email}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Rôle</dt>
              <dd className="font-medium text-slate-900">{state.user.role}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Statut</dt>
              <dd className="font-medium text-slate-900">{state.user.status}</dd>
            </div>
          </dl>
        </Card>

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
                setState(await loadData());
                event.currentTarget.reset();
              } catch (error: unknown) {
                setMessage(error instanceof Error ? error.message : "Impossible d'ajouter le véhicule.");
              } finally {
                setIsSubmittingVehicle(false);
              }
            }}
          >
            <input name="brand" className="field" placeholder="Marque" required />
            <input name="model" className="field" placeholder="Modèle" required />
            <input name="color" className="field" placeholder="Couleur" />
            <input name="plate" className="field" placeholder="Immatriculation" required />
            <input
              name="seats_total"
              className="field"
              type="number"
              min={2}
              max={9}
              defaultValue={4}
              required
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="is_primary" />
              Véhicule principal
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={isSubmittingVehicle} className="w-full">
                {isSubmittingVehicle ? "Enregistrement..." : "Ajouter le véhicule"}
              </Button>
            </div>
            {message && <p className="sm:col-span-2 text-sm text-slate-600">{message}</p>}
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Mes véhicules</CardTitle>
          {state.vehicles.length === 0 ? (
            <CardBody>Aucun véhicule enregistré pour le moment.</CardBody>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {state.vehicles.map((vehicle) => (
                <li key={vehicle.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {vehicle.brand} {vehicle.model}
                      </p>
                      <p className="text-sm text-slate-600">
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
                        setState(await loadData());
                      }}
                      className="text-sm font-medium text-rose-700 hover:text-rose-800"
                    >
                      Désactiver
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Mes trajets publiés</CardTitle>
          {state.trips.length === 0 ? (
            <CardBody>Aucun trajet publié pour le moment.</CardBody>
          ) : (
            <ul className="mt-4 space-y-3">
              {state.trips.map((trip) => (
                <li key={trip.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {trip.origin_label} → {trip.destination_label}
                      </p>
                      <p className="text-sm text-slate-600">
                        {new Date(trip.departure_time).toLocaleString("fr-FR")} · {trip.seats_available}/
                        {trip.seats_total} places
                      </p>
                      <p className="text-xs text-slate-500">
                        {trip.is_paid ? `${((trip.price_per_seat_cents ?? 0) / 100).toFixed(2)} €` : "Gratuit"}
                      </p>
                    </div>
                    <Badge tone={trip.status === "scheduled" ? "success" : "warning"}>{trip.status}</Badge>
                  </div>
                  {trip.status === "scheduled" && (
                    <div className="mt-3">
                      <button
                        type="button"
                        className="text-sm font-medium text-rose-700 hover:text-rose-800"
                        onClick={async () => {
                          await cancelTrip(trip.id);
                          setState(await loadData());
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

        <Card className="lg:col-span-2">
          <CardTitle>Mes réservations passager</CardTitle>
          {state.bookings.length === 0 ? (
            <CardBody>Aucune réservation en cours.</CardBody>
          ) : (
            <ul className="mt-4 space-y-3">
              {state.bookings.map((booking) => (
                <li key={booking.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {booking.trip_origin_label} → {booking.trip_destination_label}
                      </p>
                      <p className="text-sm text-slate-600">
                        {new Date(booking.trip_departure_time).toLocaleString("fr-FR")} ·{" "}
                        {booking.requested_seats} place(s)
                      </p>
                      <p className="text-xs text-slate-500">Conducteur: {booking.driver_name}</p>
                    </div>
                    <Badge tone={booking.status === "accepted" ? "success" : "warning"}>
                      {booking.status}
                    </Badge>
                  </div>
                  {(booking.status === "pending" || booking.status === "accepted") && (
                    <div className="mt-3">
                      <button
                        type="button"
                        className="text-sm font-medium text-rose-700 hover:text-rose-800"
                        onClick={async () => {
                          await cancelBooking(booking.id);
                          setState(await loadData());
                        }}
                      >
                        Annuler ma réservation
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Demandes reçues sur mes trajets</CardTitle>
          {state.incomingBookings.length === 0 ? (
            <CardBody>Aucune demande reçue pour le moment.</CardBody>
          ) : (
            <ul className="mt-4 space-y-3">
              {state.incomingBookings.map((booking) => (
                <li key={booking.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {booking.trip_origin_label} → {booking.trip_destination_label}
                      </p>
                      <p className="text-sm text-slate-600">
                        {booking.passenger_name} · {booking.requested_seats} place(s)
                      </p>
                      <p className="text-xs text-slate-500">
                        Départ: {new Date(booking.trip_departure_time).toLocaleString("fr-FR")}
                      </p>
                    </div>
                    <Badge tone={booking.status === "accepted" ? "success" : "warning"}>
                      {booking.status}
                    </Badge>
                  </div>
                  {booking.status === "pending" && (
                    <div className="mt-3 flex gap-3">
                      <button
                        type="button"
                        className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
                        onClick={async () => {
                          await acceptBooking(booking.id);
                          setState(await loadData());
                        }}
                      >
                        Accepter
                      </button>
                      <button
                        type="button"
                        className="text-sm font-medium text-rose-700 hover:text-rose-800"
                        onClick={async () => {
                          await declineBooking(booking.id);
                          setState(await loadData());
                        }}
                      >
                        Refuser
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Container>
    </section>
  );
}

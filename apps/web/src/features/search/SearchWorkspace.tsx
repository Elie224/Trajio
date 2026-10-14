"use client";

import { useMemo, useState } from "react";
import { CalendarClock, CircleDashed, Filter, Route, Users } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { TrajioMap } from "@/features/map/TrajioMap";
import { createBooking, searchTrips, type SearchTrip } from "@/lib/api";

type SearchState =
  | { status: "idle"; items: SearchTrip[] }
  | { status: "loading"; items: SearchTrip[] }
  | { status: "ready"; items: SearchTrip[] }
  | { status: "error"; items: SearchTrip[]; message: string };

export function SearchWorkspace() {
  const [state, setState] = useState<SearchState>({ status: "idle", items: [] });
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [requestedSeats, setRequestedSeats] = useState(1);
  const [bookingState, setBookingState] = useState<{
    status: "idle" | "submitting" | "error" | "success";
    message: string | null;
    tripId: string | null;
  }>({
    status: "idle",
    message: null,
    tripId: null,
  });

  const selectedRide = useMemo(
    () => state.items.find((item) => item.id === selectedRideId) ?? state.items[0] ?? null,
    [selectedRideId, state.items],
  );

  return (
    <section className="page-section">
      <div className="mx-auto grid w-full max-w-[94rem] gap-5 px-4 lg:grid-cols-[430px_1fr] lg:gap-6 lg:px-6">
        <aside className="surface h-fit p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Rechercher un trajet</h1>
              <p className="mt-1 text-sm text-slate-600">
                Résultats réels issus des trajets publiés.
              </p>
            </div>
            <Badge tone="success">Recherche active</Badge>
          </div>

          <form
            className="grid gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              setState((previous) => ({ status: "loading", items: previous.items }));
              try {
                const priceRaw = String(formData.get("priceMax") ?? "").trim();
                const pickupLatRaw = String(formData.get("pickupLat") ?? "").trim();
                const pickupLngRaw = String(formData.get("pickupLng") ?? "").trim();
                const dropoffLatRaw = String(formData.get("dropoffLat") ?? "").trim();
                const dropoffLngRaw = String(formData.get("dropoffLng") ?? "").trim();
                const response = await searchTrips({
                  originQuery: String(formData.get("pickup") ?? "").trim() || undefined,
                  destinationQuery: String(formData.get("dropoff") ?? "").trim() || undefined,
                  date: String(formData.get("date") ?? "").trim() || undefined,
                  earliestTime: String(formData.get("time") ?? "").trim() || undefined,
                  passengers: requestedSeats,
                  maxPriceCents: priceRaw ? Number(priceRaw) * 100 : undefined,
                  pickupLat: pickupLatRaw ? Number(pickupLatRaw) : undefined,
                  pickupLng: pickupLngRaw ? Number(pickupLngRaw) : undefined,
                  dropoffLat: dropoffLatRaw ? Number(dropoffLatRaw) : undefined,
                  dropoffLng: dropoffLngRaw ? Number(dropoffLngRaw) : undefined,
                });
                setState({ status: "ready", items: response.items });
                setSelectedRideId(response.items[0]?.id ?? null);
              } catch (unknownError: unknown) {
                setState({
                  status: "error",
                  items: [],
                  message:
                    unknownError instanceof Error
                      ? unknownError.message
                      : "Impossible de récupérer les trajets.",
                });
              }
            }}
          >
            <div>
              <label htmlFor="search-pickup" className="label">
                Départ
              </label>
              <input id="search-pickup" name="pickup" className="field" placeholder="Ex. Saint-Denis" />
            </div>
            <div>
              <label htmlFor="search-dropoff" className="label">
                Destination
              </label>
              <input id="search-dropoff" name="dropoff" className="field" placeholder="Ex. Paris" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="search-date" className="label">
                  Date
                </label>
                <input id="search-date" name="date" type="date" className="field" />
              </div>
              <div>
                <label htmlFor="search-time" className="label">
                  Heure la plus tôt
                </label>
                <input id="search-time" name="time" type="time" className="field" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="search-pickup-lat" className="label">
                  Latitude départ (optionnel)
                </label>
                <input
                  id="search-pickup-lat"
                  name="pickupLat"
                  type="number"
                  step="0.000001"
                  min={-90}
                  max={90}
                  className="field"
                  placeholder="48.856614"
                />
              </div>
              <div>
                <label htmlFor="search-pickup-lng" className="label">
                  Longitude départ (optionnel)
                </label>
                <input
                  id="search-pickup-lng"
                  name="pickupLng"
                  type="number"
                  step="0.000001"
                  min={-180}
                  max={180}
                  className="field"
                  placeholder="2.352222"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="search-dropoff-lat" className="label">
                  Latitude destination (optionnel)
                </label>
                <input
                  id="search-dropoff-lat"
                  name="dropoffLat"
                  type="number"
                  step="0.000001"
                  min={-90}
                  max={90}
                  className="field"
                  placeholder="48.856614"
                />
              </div>
              <div>
                <label htmlFor="search-dropoff-lng" className="label">
                  Longitude destination (optionnel)
                </label>
                <input
                  id="search-dropoff-lng"
                  name="dropoffLng"
                  type="number"
                  step="0.000001"
                  min={-180}
                  max={180}
                  className="field"
                  placeholder="2.352222"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="search-seat" className="label">
                  Passagers
                </label>
                <input
                  id="search-seat"
                  name="passengers"
                  type="number"
                  min={1}
                  max={6}
                  value={requestedSeats}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (Number.isNaN(parsed)) return;
                    setRequestedSeats(Math.min(6, Math.max(1, parsed)));
                  }}
                  className="field"
                />
              </div>
              <div>
                <label htmlFor="search-price" className="label">
                  Prix max (€)
                </label>
                <input id="search-price" name="priceMax" type="number" min={0} defaultValue={20} className="field" />
              </div>
            </div>
            <Button type="submit">
              <Filter className="h-4 w-4" />
              {state.status === "loading" ? "Recherche..." : "Rechercher"}
            </Button>
          </form>

          {state.status === "error" && <p className="mt-4 text-sm text-rose-700">{state.message}</p>}

          <div className="mt-6 grid gap-3">
            {state.items.length === 0 && state.status !== "loading" && (
              <Card className="p-4">
                <CardTitle>Aucun trajet trouvé</CardTitle>
                <CardBody>Publiez un trajet depuis &quot;Proposer un trajet&quot; puis relancez la recherche.</CardBody>
              </Card>
            )}

            {state.items.map((ride) => {
              const active = selectedRide?.id === ride.id;
              return (
                <Card
                  key={ride.id}
                  className={
                    "cursor-pointer p-4 transition " +
                    (active
                      ? "ring-2 ring-brand-500 shadow-[0_10px_24px_rgba(16,185,129,0.15)]"
                      : "hover:-translate-y-0.5 hover:ring-slate-300")
                  }
                >
                  <button
                    type="button"
                    onClick={() => setSelectedRideId(ride.id)}
                    className="w-full text-left"
                    aria-label={"Voir le trajet de " + ride.driver_name}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>{ride.driver_name}</CardTitle>
                        <CardBody>
                          {ride.origin_label} → {ride.destination_label}
                        </CardBody>
                        <p className="mt-1 text-xs text-slate-500">{ride.vehicle_label}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-emerald-700">
                          Match {Math.round(ride.match_score * 100)}%
                        </p>
                        <p className="text-lg font-semibold text-brand-700">
                          {ride.is_paid ? `${((ride.price_per_seat_cents ?? 0) / 100).toFixed(2)} €` : "Gratuit"}
                        </p>
                        <p className="text-xs text-slate-500">par passager</p>
                      </div>
                    </div>
                    <dl className="mt-3 grid grid-cols-4 gap-2 text-xs text-slate-500">
                      <div>
                        <dt className="sr-only">Heure</dt>
                        <dd className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5" />{" "}
                          {new Date(ride.departure_time).toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </dd>
                      </div>
                      <div>
                        <dt className="sr-only">Distance</dt>
                        <dd className="inline-flex items-center gap-1">
                          <Route className="h-3.5 w-3.5" /> Itinéraire
                        </dd>
                      </div>
                      <div>
                        <dt className="sr-only">Durée</dt>
                        <dd className="inline-flex items-center gap-1">
                          <CircleDashed className="h-3.5 w-3.5" /> Direct
                        </dd>
                      </div>
                      <div>
                        <dt className="sr-only">Places</dt>
                        <dd className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" /> {ride.seats_available} places
                        </dd>
                      </div>
                    </dl>
                    <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-slate-500">
                      {ride.match_reasons.slice(0, 2).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </button>
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <Button
                      type="button"
                      className="w-full"
                      disabled={bookingState.status === "submitting" && bookingState.tripId === ride.id}
                      onClick={async () => {
                        setBookingState({
                          status: "submitting",
                          message: null,
                          tripId: ride.id,
                        });
                        try {
                          await createBooking({
                            tripId: ride.id,
                            requestedSeats,
                          });
                          setBookingState({
                            status: "success",
                            message: "Réservation envoyée au conducteur.",
                            tripId: ride.id,
                          });
                        } catch (unknownError: unknown) {
                          setBookingState({
                            status: "error",
                            message:
                              unknownError instanceof Error
                                ? unknownError.message
                                : "Impossible de créer la réservation.",
                            tripId: ride.id,
                          });
                        }
                      }}
                    >
                      {bookingState.status === "submitting" && bookingState.tripId === ride.id
                        ? "Réservation..."
                        : "Réserver ce trajet"}
                    </Button>
                    {bookingState.tripId === ride.id && bookingState.message && (
                      <p
                        className={
                          "mt-2 text-xs " +
                          (bookingState.status === "success" ? "text-emerald-700" : "text-rose-700")
                        }
                      >
                        {bookingState.message}
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </aside>

        <section className="surface p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between px-2">
            <h2 className="text-sm font-semibold text-slate-800">Carte du trajet sélectionné</h2>
            <p className="text-xs text-slate-500">
              {selectedRide
                ? `${selectedRide.origin_label} → ${selectedRide.destination_label}`
                : "Sélectionnez un trajet"}
            </p>
          </div>
          <div className="h-[520px] lg:h-[760px]">
            <TrajioMap
              pickup={
                selectedRide
                  ? [Number(selectedRide.origin_lng), Number(selectedRide.origin_lat)]
                  : undefined
              }
              dropoff={
                selectedRide
                  ? [Number(selectedRide.destination_lng), Number(selectedRide.destination_lat)]
                  : undefined
              }
              route={
                selectedRide
                  ? [
                      [Number(selectedRide.origin_lng), Number(selectedRide.origin_lat)],
                      [Number(selectedRide.destination_lng), Number(selectedRide.destination_lat)],
                    ]
                  : undefined
              }
            />
          </div>
        </section>
      </div>
    </section>
  );
}

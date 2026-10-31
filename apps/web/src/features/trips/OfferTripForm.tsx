"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { ServiceError } from "@/components/ui/ServiceError";
import { SessionStatus } from "@/features/auth/SessionStatus";
import { useSession } from "@/features/auth/useSession";
import { TrajioMap } from "@/features/map/TrajioMap";
import { AddressCombobox } from "@/features/search/AddressCombobox";
import { createTrip, fetchVehicles, type Vehicle } from "@/lib/api";
import { userFacingError } from "@/lib/errors";
import {
  loadRecentSearches,
  saveRecentSearches,
  type RecentSearch,
} from "@/lib/recent-searches";

type Point = [number, number];
type PlaceTarget = "origin" | "destination";

export function OfferTripForm() {
  const session = useSession();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const [vehiclesEpoch, setVehiclesEpoch] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [originLabel, setOriginLabel] = useState("");
  const [destinationLabel, setDestinationLabel] = useState("");
  const [originPoint, setOriginPoint] = useState<Point | undefined>();
  const [destinationPoint, setDestinationPoint] = useState<Point | undefined>();
  const [placing, setPlacing] = useState<PlaceTarget>("origin");
  const [recent, setRecent] = useState<RecentSearch[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is browser-only
    setRecent(loadRecentSearches());
  }, []);

  useEffect(() => {
    if (session.status !== "authenticated") return;
    let cancelled = false;
    fetchVehicles()
      .then((items) => {
        if (!cancelled) setVehicles(items);
      })
      .catch((unknownError: unknown) => {
        if (!cancelled) {
          setVehiclesError(userFacingError(unknownError, "Impossible de charger vos véhicules."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session.status, vehiclesEpoch]);

  const mapRoute = originPoint && destinationPoint ? [originPoint, destinationPoint] : undefined;

  const detourOptions = useMemo(
    () => [
      { value: "0.1", label: "10 %" },
      { value: "0.2", label: "20 %" },
      { value: "0.3", label: "30 %" },
      { value: "0.5", label: "50 %" },
    ],
    [],
  );

  if (session.status !== "authenticated") {
    return (
      <SessionStatus
        session={session}
        loadingLabel="Chargement..."
        anonymousBody="Vous devez être connecté pour proposer un trajet."
      />
    );
  }

  if (vehicles === null && !vehiclesError) {
    return (
      <section className="page-section">
        <Container>Chargement...</Container>
      </section>
    );
  }

  if (vehiclesError) {
    return (
      <section className="page-section">
        <Container className="max-w-xl">
          <Card>
            <CardTitle>Erreur</CardTitle>
            <ServiceError
              className="mt-3"
              message={vehiclesError}
              onRetry={() => {
                setVehiclesError(null);
                setVehicles(null);
                setVehiclesEpoch((value) => value + 1);
              }}
            />
          </Card>
        </Container>
      </section>
    );
  }

  const activeVehicles = vehicles ?? [];

  return (
    <section className="page-section">
      <Container className="max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-page-text sm:text-3xl">Proposer un trajet</h1>
          <p className="mt-2 text-sm text-page-muted">
            Indiquez votre départ et votre arrivée, puis placez-les sur la carte. Un véhicule actif
            est nécessaire pour publier.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <Card>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={async (event) => {
                event.preventDefault();
                setError(null);
                setMessage(null);
                if (!originPoint || !destinationPoint) {
                  setError("Placez le départ et l'arrivée sur la carte.");
                  return;
                }
                setIsSubmitting(true);
                const formData = new FormData(event.currentTarget);
                const date = String(formData.get("date") ?? "");
                const time = String(formData.get("time") ?? "");
                const priceEuros = String(formData.get("price_euros") ?? "");
                const isPaid = formData.get("is_paid") === "on";
                const vehicleId = String(formData.get("vehicle_id") ?? "");

                try {
                  await createTrip({
                    vehicleId,
                    originLabel: originLabel.trim(),
                    destinationLabel: destinationLabel.trim(),
                    originLat: originPoint[1],
                    originLng: originPoint[0],
                    destinationLat: destinationPoint[1],
                    destinationLng: destinationPoint[0],
                    departureTime: new Date(`${date}T${time}:00`).toISOString(),
                    seatsTotal: Number(formData.get("seats_total") ?? 1),
                    isPaid,
                    pricePerSeatCents: isPaid ? Math.round(Number(priceEuros) * 100) : null,
                    maxDetourRatio: Number(formData.get("detour_ratio") ?? 0.3),
                    driverPreferences: String(formData.get("driver_preferences") ?? ""),
                    comments: String(formData.get("comments") ?? ""),
                  });
                  setMessage("Trajet publié avec succès.");
                  event.currentTarget.reset();
                  setOriginLabel("");
                  setDestinationLabel("");
                  setOriginPoint(undefined);
                  setDestinationPoint(undefined);
                  setPlacing("origin");
                } catch (unknownError: unknown) {
                  setError(userFacingError(unknownError, "Impossible de publier le trajet."));
                } finally {
                  setIsSubmitting(false);
                }
              }}
            >
              <AddressCombobox
                id="offer-origin-label"
                name="origin_label"
                label="Adresse de départ"
                placeholder="Ex. Saint-Denis Université"
                required
                role="pickup"
                value={originLabel}
                onChange={(value) => {
                  setOriginLabel(value);
                  setOriginPoint(undefined);
                }}
                onSelectPlace={(place) => setOriginPoint([place.longitude, place.latitude])}
                recent={recent}
                onPickRecent={(entry) => {
                  setOriginLabel(entry.pickup);
                  setDestinationLabel(entry.dropoff);
                  setOriginPoint(undefined);
                  setDestinationPoint(undefined);
                }}
                onClearRecent={() => {
                  setRecent([]);
                  saveRecentSearches([]);
                }}
              />
              <AddressCombobox
                id="offer-destination-label"
                name="destination_label"
                label="Adresse de destination"
                placeholder="Ex. Paris Gare du Nord"
                required
                role="dropoff"
                value={destinationLabel}
                onChange={(value) => {
                  setDestinationLabel(value);
                  setDestinationPoint(undefined);
                }}
                onSelectPlace={(place) => setDestinationPoint([place.longitude, place.latitude])}
                recent={recent}
                onPickRecent={(entry) => {
                  setOriginLabel(entry.pickup);
                  setDestinationLabel(entry.dropoff);
                  setOriginPoint(undefined);
                  setDestinationPoint(undefined);
                }}
                onClearRecent={() => {
                  setRecent([]);
                  saveRecentSearches([]);
                }}
              />
              <div>
                <label htmlFor="offer-date" className="label">
                  Date
                </label>
                <input id="offer-date" name="date" className="field" type="date" required />
              </div>
              <div>
                <label htmlFor="offer-time" className="label">
                  Heure
                </label>
                <input id="offer-time" name="time" className="field" type="time" required />
              </div>
              <div>
                <label htmlFor="offer-seats" className="label">
                  Places disponibles
                </label>
                <input
                  id="offer-seats"
                  name="seats_total"
                  className="field"
                  type="number"
                  min={1}
                  max={9}
                  defaultValue={3}
                  required
                />
              </div>
              <div>
                <label htmlFor="offer-vehicle" className="label">
                  Véhicule
                </label>
                <select
                  id="offer-vehicle"
                  name="vehicle_id"
                  className="field"
                  required
                  defaultValue={activeVehicles[0]?.id ?? ""}
                >
                  {activeVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.brand} {vehicle.model} · {vehicle.plate}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="offer-detour" className="label">
                  Détour maximum
                </label>
                <select id="offer-detour" name="detour_ratio" className="field" defaultValue="0.3" required>
                  {detourOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-[auto_1fr] items-end gap-3 sm:col-span-2">
                <label className="mb-0 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-page-text">
                  <input type="checkbox" name="is_paid" />
                  Trajet payant
                </label>
                <div>
                  <label htmlFor="offer-price" className="label">
                    Prix par passager (€)
                  </label>
                  <input
                    id="offer-price"
                    name="price_euros"
                    className="field"
                    type="number"
                    min={0}
                    step="0.1"
                    defaultValue={8}
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="offer-driver-preferences" className="label">
                  Préférences conducteur
                </label>
                <input
                  id="offer-driver-preferences"
                  name="driver_preferences"
                  className="field"
                  placeholder="Ex. Non-fumeur, bagage cabine"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="offer-comments" className="label">
                  Commentaires
                </label>
                <textarea
                  id="offer-comments"
                  name="comments"
                  className="field min-h-24"
                  placeholder="Point de rendez-vous exact, contraintes..."
                />
              </div>
              {error && (
                <p role="alert" className="sm:col-span-2 text-sm text-danger">
                  {error}
                </p>
              )}
              {message && (
                <p role="status" className="sm:col-span-2 text-sm text-emerald-700">
                  {message}
                </p>
              )}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={isSubmitting || activeVehicles.length === 0} className="w-full">
                  {isSubmitting ? "Publication..." : "Publier le trajet"}
                </Button>
              </div>
            </form>
            {activeVehicles.length === 0 && (
              <CardBody>
                <span className="text-amber-700">
                  Aucun véhicule actif : ajoutez un véhicule depuis « Mes trajets » avant de
                  publier.
                </span>
              </CardBody>
            )}
          </Card>

          <Card>
            <CardTitle>Itinéraire</CardTitle>
            <CardBody>
              Cliquez sur la carte pour placer {placing === "origin" ? "le départ" : "l'arrivée"}.
            </CardBody>
            <div className="mt-3 flex gap-1">
              <button
                type="button"
                aria-pressed={placing === "origin"}
                onClick={() => setPlacing("origin")}
                className={
                  "min-h-11 rounded-full px-3 text-sm font-medium " +
                  (placing === "origin" ? "bg-primary-strong text-white" : "text-page-muted hover:text-page-text")
                }
              >
                Départ
              </button>
              <button
                type="button"
                aria-pressed={placing === "destination"}
                onClick={() => setPlacing("destination")}
                className={
                  "min-h-11 rounded-full px-3 text-sm font-medium " +
                  (placing === "destination"
                    ? "bg-primary-strong text-white"
                    : "text-page-muted hover:text-page-text")
                }
              >
                Arrivée
              </button>
            </div>
            <div className="mt-4 h-[460px]">
              <TrajioMap
                pickup={originPoint}
                dropoff={destinationPoint}
                route={mapRoute}
                onMapClick={(lngLat) => {
                  if (placing === "origin") {
                    setOriginPoint(lngLat);
                    if (!originLabel.trim()) setOriginLabel("Point de départ sur la carte");
                    setPlacing("destination");
                  } else {
                    setDestinationPoint(lngLat);
                    if (!destinationLabel.trim()) setDestinationLabel("Point d'arrivée sur la carte");
                  }
                }}
              />
            </div>
          </Card>
        </div>
      </Container>
    </section>
  );
}

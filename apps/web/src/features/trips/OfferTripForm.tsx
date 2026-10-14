"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { TrajioMap } from "@/features/map/TrajioMap";
import {
  createTrip,
  fetchCurrentUser,
  fetchVehicles,
  isUnauthenticated,
  type UserProfile,
  type Vehicle,
} from "@/lib/api";
import { loginHref } from "@/lib/safe-redirect";

type State =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "ready"; user: UserProfile; vehicles: Vehicle[] }
  | { status: "error"; message: string };

export function OfferTripForm() {
  const [state, setState] = useState<State>({ status: "loading" });
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [originLat, setOriginLat] = useState("48.9542");
  const [originLng, setOriginLng] = useState("2.3615");
  const [destinationLat, setDestinationLat] = useState("48.8809");
  const [destinationLng, setDestinationLng] = useState("2.3553");

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCurrentUser(), fetchVehicles()])
      .then(([user, vehicles]) => {
        if (!cancelled) {
          setState({ status: "ready", user, vehicles });
        }
      })
      .catch((unknownError: unknown) => {
        if (cancelled) return;
        if (isUnauthenticated(unknownError)) {
          setState({ status: "anonymous" });
          return;
        }
        setState({
          status: "error",
          message: unknownError instanceof Error ? unknownError.message : "Erreur inattendue",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mapPickup = useMemo<[number, number] | undefined>(() => {
    const lat = Number(originLat);
    const lng = Number(originLng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lng, lat];
    return undefined;
  }, [originLat, originLng]);

  const mapDropoff = useMemo<[number, number] | undefined>(() => {
    const lat = Number(destinationLat);
    const lng = Number(destinationLng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lng, lat];
    return undefined;
  }, [destinationLat, destinationLng]);

  const mapRoute = mapPickup && mapDropoff ? [mapPickup, mapDropoff] : undefined;

  if (state.status === "loading") {
    return (
      <section className="page-section">
        <Container>Chargement...</Container>
      </section>
    );
  }

  if (state.status === "anonymous") {
    return (
      <section className="page-section">
        <Container className="max-w-3xl">
          <Card>
            <CardTitle>Connexion requise</CardTitle>
            <CardBody>Vous devez être connecté pour proposer un trajet.</CardBody>
            <div className="mt-4">
              <Link
                href={loginHref(pathname)}
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Se connecter
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
        <Container className="max-w-3xl">
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
      <Container className="max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Proposer un trajet</h1>
            <p className="mt-2 text-sm text-slate-600">
              Publication réelle vers l&apos;API. Assurez-vous d&apos;avoir au moins un véhicule actif.
            </p>
          </div>
          <Badge tone="success">Publication active</Badge>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <Card>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={async (event) => {
                event.preventDefault();
                setError(null);
                setMessage(null);
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
                    originLabel: String(formData.get("origin_label") ?? ""),
                    destinationLabel: String(formData.get("destination_label") ?? ""),
                    originLat: Number(formData.get("origin_lat") ?? "0"),
                    originLng: Number(formData.get("origin_lng") ?? "0"),
                    destinationLat: Number(formData.get("destination_lat") ?? "0"),
                    destinationLng: Number(formData.get("destination_lng") ?? "0"),
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
                } catch (unknownError: unknown) {
                  setError(
                    unknownError instanceof Error
                      ? unknownError.message
                      : "Impossible de publier le trajet.",
                  );
                } finally {
                  setIsSubmitting(false);
                }
              }}
            >
              <div>
                <label htmlFor="offer-origin-label" className="label">
                  Adresse de départ
                </label>
                <input
                  id="offer-origin-label"
                  name="origin_label"
                  className="field"
                  placeholder="Ex. Saint-Denis Université"
                  required
                />
              </div>
              <div>
                <label htmlFor="offer-destination-label" className="label">
                  Adresse de destination
                </label>
                <input
                  id="offer-destination-label"
                  name="destination_label"
                  className="field"
                  placeholder="Ex. Paris Gare du Nord"
                  required
                />
              </div>
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
                  defaultValue={state.vehicles[0]?.id ?? ""}
                >
                  {state.vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.brand} {vehicle.model} · {vehicle.plate}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="offer-origin-lat" className="label">
                  Latitude départ
                </label>
                <input
                  id="offer-origin-lat"
                  name="origin_lat"
                  className="field"
                  value={originLat}
                  onChange={(event) => setOriginLat(event.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="offer-origin-lng" className="label">
                  Longitude départ
                </label>
                <input
                  id="offer-origin-lng"
                  name="origin_lng"
                  className="field"
                  value={originLng}
                  onChange={(event) => setOriginLng(event.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="offer-destination-lat" className="label">
                  Latitude destination
                </label>
                <input
                  id="offer-destination-lat"
                  name="destination_lat"
                  className="field"
                  value={destinationLat}
                  onChange={(event) => setDestinationLat(event.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="offer-destination-lng" className="label">
                  Longitude destination
                </label>
                <input
                  id="offer-destination-lng"
                  name="destination_lng"
                  className="field"
                  value={destinationLng}
                  onChange={(event) => setDestinationLng(event.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="offer-detour" className="label">
                  Détour max (0 à 1)
                </label>
                <input
                  id="offer-detour"
                  name="detour_ratio"
                  className="field"
                  type="number"
                  min={0}
                  max={1}
                  step="0.01"
                  defaultValue={0.3}
                  required
                />
              </div>
              <div className="grid grid-cols-[auto_1fr] items-end gap-3">
                <label className="mb-0 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" name="is_paid" />
                  Trajet payant
                </label>
                <input
                  name="price_euros"
                  className="field"
                  type="number"
                  min={0}
                  step="0.1"
                  defaultValue={8}
                  placeholder="Prix / passager (€)"
                />
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
              {error && <p className="sm:col-span-2 text-sm text-rose-700">{error}</p>}
              {message && <p className="sm:col-span-2 text-sm text-emerald-700">{message}</p>}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={isSubmitting || state.vehicles.length === 0} className="w-full">
                  {isSubmitting ? "Publication..." : "Publier le trajet"}
                </Button>
              </div>
            </form>
            {state.vehicles.length === 0 && (
              <CardBody>
                <span className="text-amber-700">
                  Aucun véhicule actif : ajoutez un véhicule depuis &quot;Mes trajets&quot; avant de
                  publier.
                </span>
              </CardBody>
            )}
          </Card>

          <Card>
            <CardTitle>Prévisualisation de l&apos;itinéraire</CardTitle>
            <CardBody>La carte met à jour les points de départ et d&apos;arrivée saisis.</CardBody>
            <div className="mt-4 h-[460px]">
              <TrajioMap pickup={mapPickup} dropoff={mapDropoff} route={mapRoute} />
            </div>
          </Card>
        </div>
      </Container>
    </section>
  );
}

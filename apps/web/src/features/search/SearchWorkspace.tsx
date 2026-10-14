"use client";
import { ServiceError } from "@/components/ui/ServiceError";
import { SERVICE_UNAVAILABLE_MESSAGE, userFacingError } from "@/lib/errors";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, CalendarDays, ChevronUp, Car, Search, SlidersHorizontal, Star, Users } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { TrajioMap } from "@/features/map/TrajioMap";
import { AddressCombobox } from "@/features/search/AddressCombobox";
import { ApiError, createBooking, searchTrips, type SearchTrip } from "@/lib/api";
import {
  addRecentSearch,
  loadRecentSearches,
  saveRecentSearches,
  type RecentSearch,
} from "@/lib/recent-searches";
import { estimateTrip, formatDuration } from "@/lib/trip-estimate";

type SearchState =
  | { status: "idle"; items: SearchTrip[] }
  | { status: "loading"; items: SearchTrip[] }
  | { status: "ready"; items: SearchTrip[] }
  | { status: "error"; items: SearchTrip[]; message: string };

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatPrice(ride: SearchTrip): string {
  return ride.is_paid ? `${((ride.price_per_seat_cents ?? 0) / 100).toFixed(2)} €` : "Gratuit";
}

export function SearchWorkspace() {
  const [state, setState] = useState<SearchState>({ status: "idle", items: [] });
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [requestedSeats, setRequestedSeats] = useState(1);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  // Native date inputs follow the browser language (mm/dd/yyyy in an English
  // browser), so the chosen date is also spelled out in French below the field.
  const [dateLabel, setDateLabel] = useState("");
  const updateDateLabel = (value: string) => {
    const [y, m, d] = value.split("-").map(Number);
    setDateLabel(
      y && m && d
        ? new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
            new Date(y, m - 1, d),
          )
        : "",
    );
  };

  // Default date = today (local), set after mount: the page is prerendered.
  useEffect(() => {
    const input = dateRef.current;
    if (!input || input.value) return;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    input.value = today;
    input.min = today;
    updateDateLabel(today);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is browser-only
    setRecent(loadRecentSearches());
  }, []);

  const pickRecent = (entry: RecentSearch) => {
    setPickup(entry.pickup);
    setDropoff(entry.dropoff);
  };
  const clearRecent = () => {
    setRecent([]);
    saveRecentSearches([]);
  };
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

  const pickupPoint = useMemo<[number, number] | undefined>(
    () => (selectedRide ? [Number(selectedRide.origin_lng), Number(selectedRide.origin_lat)] : undefined),
    [selectedRide],
  );
  const dropoffPoint = useMemo<[number, number] | undefined>(
    () =>
      selectedRide
        ? [Number(selectedRide.destination_lng), Number(selectedRide.destination_lat)]
        : undefined,
    [selectedRide],
  );
  const estimate = useMemo(
    () => (pickupPoint && dropoffPoint ? estimateTrip(pickupPoint, dropoffPoint) : null),
    [pickupPoint, dropoffPoint],
  );

  const routePoints = useMemo(
    () => (pickupPoint && dropoffPoint ? [pickupPoint, dropoffPoint] : undefined),
    [pickupPoint, dropoffPoint],
  );

  return (
    <section
      className={
        "relative h-[calc(100dvh-8rem-env(safe-area-inset-bottom))] min-h-[480px] overflow-hidden " +
        "md:h-[calc(100dvh-4rem)] lg:min-h-[560px]"
      }
    >
      {/* Map fills the whole area under the header (and above the mobile tab bar). */}
      <div className="absolute inset-0">
        <TrajioMap
          className="!min-h-0 !rounded-none !border-0"
          pickup={pickupPoint}
          dropoff={dropoffPoint}
          route={routePoints}
        />
      </div>

      {/* Bottom sheet on mobile, floating panel on desktop. */}
      <div
        id="search-sheet"
        className={
          "absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-[var(--radius-sheet)] bg-page-surface shadow-card " +
          "transition-[height] duration-300 motion-reduce:transition-none " +
          (sheetExpanded ? "h-[calc(100%-2rem)] " : "h-1/2 ") +
          "lg:bottom-auto lg:left-6 lg:right-auto lg:top-6 lg:h-auto lg:max-h-[calc(100%-3rem)] lg:w-[440px] " +
          "lg:rounded-[var(--radius-card)] lg:border lg:border-page-border"
        }
      >
        <button
          type="button"
          onClick={() => setSheetExpanded((value) => !value)}
          aria-expanded={sheetExpanded}
          aria-controls="search-sheet-content"
          className="flex min-h-11 w-full shrink-0 flex-col items-center justify-center gap-1 rounded-t-[var(--radius-sheet)] lg:hidden"
        >
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-page-muted" />
          <span className="sr-only">{sheetExpanded ? "Réduire le panneau de recherche" : "Agrandir le panneau de recherche"}</span>
          <ChevronUp
            aria-hidden="true"
            className={"h-4 w-4 text-page-muted transition-transform " + (sheetExpanded ? "rotate-180" : "")}
          />
        </button>
        <div id="search-sheet-content" className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 lg:p-6">

        <h1 className="sr-only">Rechercher un trajet</h1>

        <nav aria-label="Type de trajet" className="mb-6 grid grid-cols-2 gap-1 rounded-full bg-brand-50 p-1">
          <span
            aria-current="page"
            className="flex min-h-11 items-center justify-center rounded-full bg-primary-strong px-4 text-sm font-medium text-white"
          >
            Trouver un trajet
          </span>
          <Link
            href="/offer"
            className="flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-page-muted hover:text-page-text"
          >
            Proposer un trajet
          </Link>
        </nav>

        <form
          id="search-form"
          className="grid gap-4"
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
                originQuery: pickup.trim() || undefined,
                destinationQuery: dropoff.trim() || undefined,
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
              const nextRecent = addRecentSearch(recent, { pickup, dropoff });
              setRecent(nextRecent);
              saveRecentSearches(nextRecent);
              setSelectedRideId(response.items[0]?.id ?? null);
            } catch (unknownError: unknown) {
              setState({
                status: "error",
                items: [],
                message:
                  unknownError instanceof ApiError && unknownError.status === 401
                    ? "Connectez-vous pour rechercher un trajet."
                    : userFacingError(unknownError, "Impossible de récupérer les trajets."),
              });
            }
          }}
        >
          {/* Origin / destination linked by a dotted line, with a swap button. */}
          <div className="relative rounded-[var(--radius-card)] border border-page-border p-4">
            <div aria-hidden="true" className="absolute bottom-[38px] left-[27px] top-[38px] flex flex-col items-center">
              <span className="h-3 w-3 rounded-full border-2 border-primary bg-white" />
              <span className="my-1 w-0 flex-1 border-l-2 border-dotted border-primary" />
              <span className="h-3 w-3 rounded-full bg-primary-strong" />
            </div>
            <div className="grid gap-3 pl-8 pr-14">
              <AddressCombobox
                id="search-pickup"
                name="pickup"
                label="Départ"
                placeholder="Ex. Saint-Denis"
                role="pickup"
                value={pickup}
                onChange={setPickup}
                recent={recent}
                onPickRecent={pickRecent}
                onClearRecent={clearRecent}
              />
              <AddressCombobox
                id="search-dropoff"
                name="dropoff"
                label="Destination"
                placeholder="Ex. Paris"
                role="dropoff"
                value={dropoff}
                onChange={setDropoff}
                recent={recent}
                onPickRecent={pickRecent}
                onClearRecent={clearRecent}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setPickup(dropoff);
                setDropoff(pickup);
              }}
              aria-label="Inverser départ et destination"
              className="absolute right-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-page-border bg-white text-primary-strong shadow-card hover:bg-brand-50"
            >
              <ArrowUpDown className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="search-date" className="label">
                <CalendarDays className="mr-1 h-4 w-4" aria-hidden="true" /> Date
              </label>
              <input
                ref={dateRef}
                id="search-date"
                name="date"
                type="date"
                lang="fr"
                className="field"
                aria-describedby="search-date-label"
                onChange={(event) => updateDateLabel(event.target.value)}
              />
              <p id="search-date-label" className="mt-1 text-sm text-page-muted" aria-live="polite">
                {dateLabel}
              </p>
            </div>
            <div>
              <label htmlFor="search-seat" className="label">
                <Users className="mr-1 h-4 w-4" aria-hidden="true" /> Passagers
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
          </div>

          <details className="group rounded-[var(--radius-control)] border border-page-border">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-page-muted">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Plus de filtres
            </summary>
            <div className="grid gap-3 p-4 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="search-time" className="label">
                    Heure la plus tôt
                  </label>
                  <input id="search-time" name="time" type="time" className="field" />
                </div>
                <div>
                  <label htmlFor="search-price" className="label">
                    Prix max (€)
                  </label>
                  <input id="search-price" name="priceMax" type="number" min={0} defaultValue={20} className="field" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="search-pickup-lat" className="label">
                    Latitude départ
                  </label>
                  <input id="search-pickup-lat" name="pickupLat" type="number" step="0.000001" min={-90} max={90} className="field" placeholder="48.856614" />
                </div>
                <div>
                  <label htmlFor="search-pickup-lng" className="label">
                    Longitude départ
                  </label>
                  <input id="search-pickup-lng" name="pickupLng" type="number" step="0.000001" min={-180} max={180} className="field" placeholder="2.352222" />
                </div>
                <div>
                  <label htmlFor="search-dropoff-lat" className="label">
                    Latitude arrivée
                  </label>
                  <input id="search-dropoff-lat" name="dropoffLat" type="number" step="0.000001" min={-90} max={90} className="field" placeholder="48.856614" />
                </div>
                <div>
                  <label htmlFor="search-dropoff-lng" className="label">
                    Longitude arrivée
                  </label>
                  <input id="search-dropoff-lng" name="dropoffLng" type="number" step="0.000001" min={-180} max={180} className="field" placeholder="2.352222" />
                </div>
              </div>
            </div>
          </details>

          <Button type="submit" className="!w-full" disabled={state.status === "loading"}>
            <Search className="h-5 w-5" aria-hidden="true" />
            {state.status === "loading" ? "Recherche…" : "Rechercher"}
          </Button>
        </form>

        <div className="mt-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg text-page-text">Trajets disponibles</h2>
            <p role="status" aria-live="polite" className="text-sm text-page-muted">
              {state.status === "loading"
                ? "Recherche en cours…"
                : state.status === "ready"
                  ? `${state.items.length} résultat${state.items.length > 1 ? "s" : ""}`
                  : ""}
            </p>
          </div>

          {selectedRide && estimate && (
            <section
              aria-labelledby="trip-summary-title"
              className="mb-4 rounded-[var(--radius-card)] bg-brand-50 p-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 id="trip-summary-title" className="text-base text-page-text">
                  Résumé du trajet
                </h3>
                <span className="text-sm text-page-muted">estimation</span>
              </div>
              <p className="mt-1 truncate text-sm text-page-muted">
                {selectedRide.origin_label} → {selectedRide.destination_label}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <dt className="text-sm text-page-muted">Distance</dt>
                  <dd className="figure text-base text-page-text">
                    ≈ {Math.round(estimate.distanceKm).toLocaleString("fr-FR")} km
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-page-muted">Durée</dt>
                  <dd className="figure text-base text-page-text">≈ {formatDuration(estimate.durationMin)}</dd>
                </div>
</dl>
              <p className="mt-2 text-sm text-page-muted">
                Estimation : distance à vol d&apos;oiseau × 1,3, à 45 km/h de moyenne.
              </p>
            </section>
          )}

          {state.status === "error" &&
            (state.message === SERVICE_UNAVAILABLE_MESSAGE ? (
              <ServiceError
                className="mb-3"
                onRetry={() => document.querySelector<HTMLFormElement>("#search-form")?.requestSubmit()}
              />
            ) : (
              <p role="alert" className="mb-3 text-sm text-danger">
                {state.message}
              </p>
            ))}

          {state.items.length === 0 && state.status !== "loading" && (
            <div className="rounded-[var(--radius-card)] border border-dashed border-page-border p-4 text-sm text-page-muted">
              {state.status === "ready"
                ? "Aucun trajet trouvé. Essayez une autre date ou élargissez vos filtres."
                : "Indiquez votre départ et votre destination pour voir les conducteurs qui passent près de vous."}
            </div>
          )}

          <ul className="grid gap-3">
            {state.items.map((ride) => {
              const active = selectedRide?.id === ride.id;
              const booking = bookingState.tripId === ride.id ? bookingState : null;
              return (
                <li
                  key={ride.id}
                  className={
                    "rounded-[var(--radius-card)] border bg-page-surface p-4 shadow-card transition " +
                    (active ? "border-primary ring-2 ring-active" : "border-page-border hover:border-brand-300")
                  }
                >
                  <button
                    type="button"
                    onClick={() => setSelectedRideId(ride.id)}
                    aria-pressed={active}
                    aria-label={`Afficher sur la carte le trajet de ${ride.driver_name}, ${ride.origin_label} vers ${ride.destination_label}`}
                    className="w-full rounded-[var(--radius-control)] text-left"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-active font-heading text-sm font-semibold text-primary-strong"
                      >
                        {initials(ride.driver_name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-page-text">{ride.driver_name}</p>
                        <p className="flex items-center gap-1 text-sm text-page-muted">
                          <Star className="h-4 w-4 text-star" aria-hidden="true" />
                          <span>Pas encore d&apos;avis</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="figure text-lg text-page-text">{formatPrice(ride)}</p>
                        <p className="text-sm text-page-muted">par place</p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-3 text-sm">
                      <span className="figure text-base text-page-text">{formatTime(ride.departure_time)}</span>
                      <span className="min-w-0 flex-1 truncate text-page-muted">
                        {ride.origin_label} → {ride.destination_label}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 text-sm text-page-muted">
                      <span className="inline-flex items-center gap-1 font-medium text-primary-strong">
                        <Users className="h-4 w-4" aria-hidden="true" />
                        <span className="figure">{ride.seats_available}</span>
                        {ride.seats_available > 1 ? " places" : " place"}
                      </span>
                      <span className="inline-flex min-w-0 items-center gap-1 truncate">
                        <Car className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{ride.vehicle_label}</span>
                      </span>
                      <span className="shrink-0">Match {Math.round(ride.match_score * 100)} %</span>
                    </div>
                  </button>

                  <div className="mt-4">
                    <Button
                      type="button"
                      className="!w-full"
                      disabled={booking?.status === "submitting"}
                      onClick={async () => {
                        setBookingState({ status: "submitting", message: null, tripId: ride.id });
                        try {
                          await createBooking({ tripId: ride.id, requestedSeats });
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
                      {booking?.status === "submitting" ? "Réservation…" : "Réserver ce trajet"}
                    </Button>
                    {booking?.message && (
                      <p
                        role={booking.status === "error" ? "alert" : "status"}
                        className={
                          "mt-2 text-sm " + (booking.status === "success" ? "text-primary-strong" : "text-danger")
                        }
                      >
                        {booking.message}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        </div>
      </div>
    </section>
  );
}

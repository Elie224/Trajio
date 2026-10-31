"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Button, buttonClasses } from "@/components/ui/Button";
import { TrajioMap } from "@/features/map/TrajioMap";
import { AddressCombobox } from "@/features/search/AddressCombobox";
import {
  loadRecentSearches,
  saveRecentSearches,
  type RecentSearch,
} from "@/lib/recent-searches";

type Point = [number, number];
type PlaceTarget = "pickup" | "dropoff";

export function HomeSearchPanel() {
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [pickupPoint, setPickupPoint] = useState<Point | undefined>();
  const [dropoffPoint, setDropoffPoint] = useState<Point | undefined>();
  const [placing, setPlacing] = useState<PlaceTarget>("pickup");
  const [recent, setRecent] = useState<RecentSearch[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is browser-only
    setRecent(loadRecentSearches());
  }, []);

  const pickRecent = (entry: RecentSearch) => {
    setPickup(entry.pickup);
    setDropoff(entry.dropoff);
    setPickupPoint(undefined);
    setDropoffPoint(undefined);
  };
  const clearRecent = () => {
    setRecent([]);
    saveRecentSearches([]);
  };

  const route = useMemo(
    () => (pickupPoint && dropoffPoint ? [pickupPoint, dropoffPoint] : undefined),
    [pickupPoint, dropoffPoint],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr]">
      <div>
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 text-sm font-medium text-page-text">
          <span className="h-2 w-2 rounded-full bg-primary-strong" aria-hidden="true" />
          Covoiturage de proximité
        </p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-page-text sm:text-5xl">
          Même direction,{" "}
          <span className="text-primary-strong">partageons le trajet.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-page-muted sm:text-lg">
          Trajio rapproche les conducteurs ayant des places libres et les passagers qui vont dans
          la même direction, même lorsque les points de départ et d&apos;arrivée diffèrent.
        </p>

        <form action="/search" method="get" className="surface mt-7 grid gap-3 border-t-4 border-t-accent p-4 sm:grid-cols-2 sm:p-5">
          <AddressCombobox
            id="home-pickup"
            name="pickup"
            label="Départ"
            placeholder="Adresse de départ"
            role="pickup"
            value={pickup}
            onChange={(value) => {
              setPickup(value);
              setPickupPoint(undefined);
            }}
            onSelectPlace={(place) => setPickupPoint([place.longitude, place.latitude])}
            recent={recent}
            onPickRecent={pickRecent}
            onClearRecent={clearRecent}
          />
          <AddressCombobox
            id="home-dropoff"
            name="dropoff"
            label="Destination"
            placeholder="Adresse d'arrivée"
            role="dropoff"
            value={dropoff}
            onChange={(value) => {
              setDropoff(value);
              setDropoffPoint(undefined);
            }}
            onSelectPlace={(place) => setDropoffPoint([place.longitude, place.latitude])}
            recent={recent}
            onPickRecent={pickRecent}
            onClearRecent={clearRecent}
          />
          {pickupPoint && (
            <>
              <input type="hidden" name="pickupLat" value={pickupPoint[1]} />
              <input type="hidden" name="pickupLng" value={pickupPoint[0]} />
            </>
          )}
          {dropoffPoint && (
            <>
              <input type="hidden" name="dropoffLat" value={dropoffPoint[1]} />
              <input type="hidden" name="dropoffLng" value={dropoffPoint[0]} />
            </>
          )}
          <div>
            <label htmlFor="home-date" className="label">
              Date
            </label>
            <input id="home-date" name="date" type="date" className="field" />
          </div>
          <div>
            <label htmlFor="home-time" className="label">
              Heure
            </label>
            <input id="home-time" name="time" type="time" className="field" />
          </div>
          <div>
            <label htmlFor="home-passengers" className="label">
              Passagers
            </label>
            <input
              id="home-passengers"
              name="passengers"
              type="number"
              min={1}
              max={6}
              defaultValue={1}
              className="field"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" className="w-full">
              Rechercher un trajet
            </Button>
            <Link href="/offer" className={buttonClasses("secondary", "!w-full")}>
              Proposer un trajet
            </Link>
          </div>
        </form>
      </div>

      <div className="surface border-t-4 border-t-primary-strong p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
          <p className="text-xs font-medium text-page-muted">
            Cliquez sur la carte pour placer {placing === "pickup" ? "le départ" : "l'arrivée"}.
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              aria-pressed={placing === "pickup"}
              onClick={() => setPlacing("pickup")}
              className={
                "min-h-11 rounded-full px-3 text-sm font-medium " +
                (placing === "pickup" ? "bg-primary-strong text-white" : "text-page-muted hover:text-page-text")
              }
            >
              Départ
            </button>
            <button
              type="button"
              aria-pressed={placing === "dropoff"}
              onClick={() => setPlacing("dropoff")}
              className={
                "min-h-11 rounded-full px-3 text-sm font-medium " +
                (placing === "dropoff" ? "bg-primary-strong text-white" : "text-page-muted hover:text-page-text")
              }
            >
              Arrivée
            </button>
          </div>
        </div>
        <div className="h-[320px] sm:h-[420px]">
          <TrajioMap
            pickup={pickupPoint}
            dropoff={dropoffPoint}
            route={route}
            onMapClick={(lngLat) => {
              if (placing === "pickup") {
                setPickupPoint(lngLat);
                if (!pickup.trim()) setPickup("Point de départ sur la carte");
                setPlacing("dropoff");
              } else {
                setDropoffPoint(lngLat);
                if (!dropoff.trim()) setDropoff("Point d'arrivée sur la carte");
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

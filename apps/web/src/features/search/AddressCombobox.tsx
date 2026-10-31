"use client";

import { useEffect, useId, useState } from "react";
import { History, MapPin } from "lucide-react";

import type { RecentSearch } from "@/lib/recent-searches";
import { fetchPlaces, type PlaceSuggestion } from "@/lib/places";

type Props = {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSelectPlace?: (place: PlaceSuggestion) => void;
  required?: boolean;
  /** Field this combobox edits, used to pick the suggestion title. */
  role: "pickup" | "dropoff";
  recent?: RecentSearch[];
  onPickRecent?: (entry: RecentSearch) => void;
  onClearRecent?: () => void;
};

/**
 * Address field with a suggestion list (ARIA 1.2 combobox pattern).
 * IGN place suggestions while typing; recent searches while empty.
 */
export function AddressCombobox({
  id,
  name,
  label,
  placeholder,
  value,
  onChange,
  onSelectPlace,
  required,
  role,
  recent = [],
  onPickRecent,
  onClearRecent,
}: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lookup, setLookup] = useState<{
    query: string;
    places: PlaceSuggestion[];
    status: "loading" | "ready" | "error";
  } | null>(null);
  const query = value.trim();

  useEffect(() => {
    if (!open || query.length < 3) return;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(async () => {
      setLookup({ query, places: [], status: "loading" });
      timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const places = await fetchPlaces(query, controller.signal);
        if (!controller.signal.aborted) setLookup({ query, places, status: "ready" });
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          console.error("Autocomplétion IGN indisponible", error);
          setLookup({ query, places: [], status: "error" });
        } else if (timeout !== undefined) {
          console.error("Délai dépassé pour l'autocomplétion IGN", error);
          setLookup({ query, places: [], status: "error" });
        }
      } finally {
        clearTimeout(timeout);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      clearTimeout(timeout);
      timeout = undefined;
      controller.abort();
    };
  }, [open, query]);

  const options = query === "" && onPickRecent ? recent : [];
  const places = lookup?.query === query ? lookup.places : [];
  const optionCount = query ? places.length : options.length;
  const expanded = open && (optionCount > 0 || query.length >= 3);

  const pick = (entry: RecentSearch) => {
    onPickRecent?.(entry);
    setOpen(false);
    setActiveIndex(-1);
  };
  const pickPlace = (place: PlaceSuggestion) => {
    onChange(place.label);
    onSelectPlace?.(place);
    setOpen(false);
    setActiveIndex(-1);
  };
  const pickIndex = (index: number) => {
    if (query && places[index]) pickPlace(places[index]);
    else if (options[index]) pick(options[index]);
  };

  return (
    <div
      className="relative"
      onBlur={(event) => {
        // Close when focus leaves the whole combobox (input + list + clear button).
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        name={name}
        className="field"
        placeholder={placeholder}
        autoComplete="off"
        required={required}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((i) => (optionCount ? (i + 1) % optionCount : -1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((i) => (optionCount ? (i <= 0 ? optionCount - 1 : i - 1) : -1));
          } else if (event.key === "Enter" && expanded && activeIndex >= 0) {
            event.preventDefault();
            pickIndex(activeIndex);
          } else if (event.key === "Escape" && expanded) {
            event.preventDefault();
            setOpen(false);
          }
        }}
      />
      <div
        className={
          "absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-[var(--radius-control)] border border-page-border bg-white shadow-card " +
          (expanded ? "" : "hidden")
        }
      >
        <p className="px-4 pt-3 text-sm font-medium text-page-muted">
          {query ? "Suggestions de lieux · IGN" : "Recherches récentes"}
        </p>
        {query && optionCount === 0 && (
          <p role="status" className="px-4 py-3 text-sm text-page-muted">
            {lookup?.query !== query || lookup.status === "loading"
              ? "Recherche de lieux…"
              : lookup.status === "error"
                ? "Suggestions indisponibles. Réessayez ou saisissez le lieu manuellement."
                : "Aucun lieu trouvé. Précisez la ville ou le code postal."}
          </p>
        )}
        <ul id={listId} role="listbox" aria-label={query ? "Suggestions de lieux" : "Recherches récentes"}>
          {places.map((place, index) => (
            <li
              key={`${place.label}|${place.longitude}|${place.latitude}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                pickPlace(place);
              }}
              className={"flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 " +
                (index === activeIndex ? "bg-active" : "hover:bg-brand-50")}
            >
              <MapPin className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-base text-page-text [overflow-wrap:anywhere]">{place.label}</span>
                <span className="block text-sm text-page-muted">{place.detail}</span>
              </span>
            </li>
          ))}
          {options.map((entry, index) => {
            const title = (role === "pickup" ? entry.pickup : entry.dropoff) || "Adresse non précisée";
            const other = role === "pickup" ? entry.dropoff : entry.pickup;
            return (
              <li
                key={`${entry.pickup}|${entry.dropoff}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                // mousedown keeps focus in the input (blur would close the list first).
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(entry);
                }}
                className={
                  "flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 " +
                  (index === activeIndex ? "bg-active" : "hover:bg-brand-50")
                }
              >
                <History className="h-5 w-5 shrink-0 text-page-muted" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-base text-page-text">{title}</span>
                  <span className="flex items-center gap-1 truncate text-sm text-page-muted">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {other ? (role === "pickup" ? `vers ${other}` : `depuis ${other}`) : "Recherche récente"}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        {!query && onClearRecent && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onClearRecent();
              setOpen(false);
            }}
            className="min-h-11 w-full border-t border-page-border px-4 text-left text-sm font-medium text-primary-strong hover:bg-brand-50"
          >
            Effacer l&apos;historique
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useId, useState } from "react";
import { History, MapPin } from "lucide-react";

import type { RecentSearch } from "@/lib/recent-searches";

type Props = {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** Field this combobox edits, used to pick the suggestion title. */
  role: "pickup" | "dropoff";
  recent: RecentSearch[];
  onPickRecent: (entry: RecentSearch) => void;
  onClearRecent: () => void;
};

/**
 * Address field with a suggestion list (ARIA 1.2 combobox pattern).
 * No geocoding service exists yet, so suggestions are the recent searches,
 * shown while the field is empty.
 */
export function AddressCombobox({
  id,
  name,
  label,
  placeholder,
  value,
  onChange,
  role,
  recent,
  onPickRecent,
  onClearRecent,
}: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const options = value.trim() === "" ? recent : [];
  const expanded = open && options.length > 0;

  const pick = (entry: RecentSearch) => {
    onPickRecent(entry);
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        name={name}
        className="field"
        placeholder={placeholder}
        autoComplete="off"
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
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((i) => (options.length ? (i + 1) % options.length : -1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((i) => (options.length ? (i <= 0 ? options.length - 1 : i - 1) : -1));
          } else if (event.key === "Enter" && expanded && activeIndex >= 0) {
            event.preventDefault();
            pick(options[activeIndex]);
          } else if (event.key === "Escape" && expanded) {
            event.preventDefault();
            setOpen(false);
          }
        }}
      />
      <div
        className={
          "absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-[var(--radius-control)] border border-page-border bg-white shadow-card " +
          (expanded ? "" : "hidden")
        }
      >
        <p className="px-4 pt-3 text-sm font-medium text-page-muted">Recherches récentes</p>
        <ul id={listId} role="listbox" aria-label="Recherches récentes">
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
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            onClearRecent();
            setOpen(false);
          }}
          className="min-h-11 w-full border-t border-page-border px-4 text-left text-sm font-medium text-primary-strong hover:bg-brand-50"
        >
          Effacer l&apos;historique
        </button>
      </div>
    </div>
  );
}

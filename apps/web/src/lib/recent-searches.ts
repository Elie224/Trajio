/**
 * Recent searches for /search, kept only in this browser (localStorage).
 * Shown when address fields are empty, alongside live IGN suggestions while typing.
 */

export type RecentSearch = { pickup: string; dropoff: string };

export const RECENT_SEARCHES_KEY = "trajio:recent-searches";
export const MAX_RECENT_SEARCHES = 5;
const MAX_LABEL_LENGTH = 120;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_LABEL_LENGTH) : "";
}

/** Parses stored JSON defensively: anything unexpected is dropped. */
export function parseRecentSearches(raw: string | null): RecentSearch[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => {
      const record = (item ?? {}) as Record<string, unknown>;
      return { pickup: clean(record.pickup), dropoff: clean(record.dropoff) };
    })
    .filter((item) => item.pickup !== "" || item.dropoff !== "")
    .slice(0, MAX_RECENT_SEARCHES);
}

/** Puts `entry` first, removes duplicates (case-insensitive), keeps the max. */
export function addRecentSearch(list: RecentSearch[], entry: RecentSearch): RecentSearch[] {
  const next = { pickup: clean(entry.pickup), dropoff: clean(entry.dropoff) };
  if (next.pickup === "" && next.dropoff === "") return list;
  const key = (item: RecentSearch) => `${item.pickup.toLowerCase()}|${item.dropoff.toLowerCase()}`;
  return [next, ...list.filter((item) => key(item) !== key(next))].slice(0, MAX_RECENT_SEARCHES);
}

export function loadRecentSearches(storage: StorageLike | undefined = safeStorage()): RecentSearch[] {
  try {
    return parseRecentSearches(storage?.getItem(RECENT_SEARCHES_KEY) ?? null);
  } catch {
    return [];
  }
}

export function saveRecentSearches(list: RecentSearch[], storage: StorageLike | undefined = safeStorage()) {
  try {
    if (list.length === 0) storage?.removeItem(RECENT_SEARCHES_KEY);
    else storage?.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } catch {
    // Quota or privacy mode: suggestions are a nice-to-have.
  }
}

function safeStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Removes the stored history (logout, account deletion). */
export function clearRecentSearches(storage: StorageLike | undefined = safeStorage()) {
  saveRecentSearches([], storage);
}

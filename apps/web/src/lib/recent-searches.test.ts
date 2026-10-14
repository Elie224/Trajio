import { describe, expect, it } from "vitest";

import {
  MAX_RECENT_SEARCHES,
  RECENT_SEARCHES_KEY,
  addRecentSearch,
  loadRecentSearches,
  parseRecentSearches,
  saveRecentSearches,
} from "./recent-searches";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

describe("recent searches", () => {
  it("ignore un contenu illisible ou mal forme", () => {
    expect(parseRecentSearches(null)).toEqual([]);
    expect(parseRecentSearches("pas du json")).toEqual([]);
    expect(parseRecentSearches('{"a":1}')).toEqual([]);
    expect(parseRecentSearches('[{"pickup":42},{"pickup":"Paris","dropoff":null}]')).toEqual([
      { pickup: "Paris", dropoff: "" },
    ]);
  });

  it("met la recherche en tete et dedoublonne sans tenir compte de la casse", () => {
    const list = addRecentSearch([{ pickup: "Paris", dropoff: "Lyon" }], { pickup: "Lille", dropoff: "" });
    expect(addRecentSearch(list, { pickup: " paris ", dropoff: "LYON" })).toEqual([
      { pickup: "paris", dropoff: "LYON" },
      { pickup: "Lille", dropoff: "" },
    ]);
  });

  it("ignore une recherche vide et limite la taille", () => {
    expect(addRecentSearch([], { pickup: " ", dropoff: "" })).toEqual([]);
    let list: { pickup: string; dropoff: string }[] = [];
    for (let i = 0; i < 10; i++) list = addRecentSearch(list, { pickup: `V${i}`, dropoff: "" });
    expect(list).toHaveLength(MAX_RECENT_SEARCHES);
    expect(list[0].pickup).toBe("V9");
  });

  it("sauvegarde, relit et efface", () => {
    const storage = memoryStorage();
    saveRecentSearches([{ pickup: "A", dropoff: "B" }], storage);
    expect(loadRecentSearches(storage)).toEqual([{ pickup: "A", dropoff: "B" }]);
    saveRecentSearches([], storage);
    expect(storage.data.has(RECENT_SEARCHES_KEY)).toBe(false);
  });
});

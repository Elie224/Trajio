import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchPlaces, parsePlaces } from "./places";

const payload = {
  status: "OK",
  results: [{ fulltext: "Saint-Denis, 93200", x: 2.363627, y: 48.942198, country: "PositionOfInterest" }],
};

afterEach(() => vi.unstubAllGlobals());

describe("IGN place suggestions", () => {
  it("preserves the label and WGS84 coordinates", () => {
    expect(parsePlaces(payload)).toEqual([{
      label: "Saint-Denis, 93200", detail: "Ville ou lieu", longitude: 2.363627, latitude: 48.942198,
    }]);
  });

  it("distinguishes no results from a malformed response", () => {
    expect(parsePlaces({ status: "OK", results: [] })).toEqual([]);
    expect(() => parsePlaces({ status: "ERROR" })).toThrow();
    expect(() => parsePlaces({ status: "OK", results: [{ fulltext: "Invalid", x: 181, y: 48 }] })).toThrow();
  });

  it("omits cookies and referrers and passes the abort signal", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => payload })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [] }) });
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    await fetchPlaces(" saint ", signal);
    const [url, options] = fetch.mock.calls[0];
    expect(new URL(url).searchParams.get("text")).toBe("saint");
    expect(options).toEqual({ signal, credentials: "omit", referrerPolicy: "no-referrer" });
  });

  it("surfaces an unavailable provider", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchPlaces("saint", new AbortController().signal)).rejects.toThrow("503");
  });

  it("includes nearby cities even when completion omits them and removes duplicates", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        status: "OK", results: [
          { fulltext: "Saint-Malo, 35400", x: -2.02, y: 48.65 },
          { fulltext: "Saint-Malo, 35400", x: -2.02, y: 48.65 },
        ],
      }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        features: [{
          properties: { label: "Saint-Denis", postcode: "93200" },
          geometry: { coordinates: [2.361503, 48.937483] },
        }],
      }) }));
    const places = await fetchPlaces("saint", new AbortController().signal);
    expect(places.map((place) => place.label)).toEqual(["Saint-Denis, 93200", "Saint-Malo, 35400"]);
  });
});

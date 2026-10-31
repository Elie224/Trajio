export type PlaceSuggestion = {
  label: string;
  detail: string;
  longitude: number;
  latitude: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parsePlaces(value: unknown): PlaceSuggestion[] {
  if (!isRecord(value) || value.status !== "OK" || !Array.isArray(value.results)) {
    throw new Error("Réponse du service de lieux invalide.");
  }
  return value.results.map((item: unknown) => {
    if (
      !isRecord(item) || typeof item.fulltext !== "string" || !item.fulltext.trim() ||
      typeof item.x !== "number" || !Number.isFinite(item.x) || Math.abs(item.x) > 180 ||
      typeof item.y !== "number" || !Number.isFinite(item.y) || Math.abs(item.y) > 90
    ) {
      throw new Error("Suggestion de lieu invalide.");
    }
    return {
      label: item.fulltext,
      detail: item.country === "StreetAddress" ? "Adresse" : "Ville ou lieu",
      longitude: item.x,
      latitude: item.y,
    };
  });
}

export async function fetchPlaces(query: string, signal: AbortSignal): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({
    text: query.trim(),
    maximumResponses: "7",
    terr: "METROPOLE",
    lon: "2.3574",
    lat: "48.9362",
  });
  const cityParams = new URLSearchParams({
    q: query.trim(), type: "municipality", autocomplete: "1", limit: "5", lon: "2.3574", lat: "48.9362",
  });
  const responses = await Promise.all([
    `https://data.geopf.fr/geocodage/completion?${params}`,
    `https://data.geopf.fr/geocodage/search?${cityParams}`,
  ].map((url) => fetch(url, { signal, credentials: "omit", referrerPolicy: "no-referrer" })));
  for (const response of responses) {
    if (!response.ok) throw new Error(`Service de lieux indisponible (${response.status}).`);
  }
  const completion: unknown = await responses[0].json();
  const cities: unknown = await responses[1].json();
  if (!isRecord(cities) || !Array.isArray(cities.features)) {
    throw new Error("Réponse du service de villes invalide.");
  }
  const cityPlaces = parsePlaces({
    status: "OK",
    results: cities.features.map((feature: unknown) => {
      if (!isRecord(feature) || !isRecord(feature.properties) || !isRecord(feature.geometry) ||
        !Array.isArray(feature.geometry.coordinates)) throw new Error("Ville invalide.");
      const properties = feature.properties;
      if (typeof properties.label !== "string" || typeof properties.postcode !== "string") {
        throw new Error("Libellé de ville invalide.");
      }
      return {
        fulltext: `${properties.label}, ${properties.postcode}`,
        x: feature.geometry.coordinates[0], y: feature.geometry.coordinates[1],
      };
    }),
  });
  const places = [...cityPlaces, ...parsePlaces(completion)];
  const proximity = (place: PlaceSuggestion) =>
    (place.latitude - 48.9362) ** 2 + ((place.longitude - 2.3574) * Math.cos(48.9362 * Math.PI / 180)) ** 2;
  const unique = new Map(places.map((place) => [place.label, place]));
  return [...unique.values()].sort((a, b) => proximity(a) - proximity(b)).slice(0, 7);
}

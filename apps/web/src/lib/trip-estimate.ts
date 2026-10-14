/**
 * Rough trip figures shown on /search. Everything here is an estimate:
 * no routing engine is available, so road distance is approximated from the
 * straight-line distance.
 */

/** Typical ratio between road distance and straight-line distance. */
export const ROAD_FACTOR = 1.3;
/** Average speed used for the duration estimate (mixed urban / ring roads). */
export const AVERAGE_SPEED_KMH = 45;

type LngLat = readonly [number, number];

/** Great-circle distance in km (haversine). */
export function haversineKm([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type TripEstimate = { distanceKm: number; durationMin: number };

export function estimateTrip(from: LngLat, to: LngLat): TripEstimate {
  const distanceKm = haversineKm(from, to) * ROAD_FACTOR;
  const durationMin = Math.max(1, Math.round((distanceKm / AVERAGE_SPEED_KMH) * 60));
  return { distanceKm, durationMin };
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

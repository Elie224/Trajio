import { describe, expect, it } from "vitest";

import { estimateTrip, formatDuration, haversineKm } from "./trip-estimate";

const PARIS: [number, number] = [2.3522, 48.8566];
const LYON: [number, number] = [4.8357, 45.764];

describe("trip estimate", () => {
  it("calcule la distance a vol d'oiseau", () => {
    expect(haversineKm(PARIS, LYON)).toBeGreaterThan(385);
    expect(haversineKm(PARIS, LYON)).toBeLessThan(400);
    expect(haversineKm(PARIS, PARIS)).toBe(0);
  });

  it("estime distance routiere et duree", () => {
    const e = estimateTrip(PARIS, LYON);
    expect(e.distanceKm).toBeCloseTo(haversineKm(PARIS, LYON) * 1.3, 5);
    expect(e.durationMin).toBe(Math.round((e.distanceKm / 45) * 60));
    expect(estimateTrip(PARIS, PARIS).durationMin).toBe(1);
  });

  it("formate la duree", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(125)).toBe("2 h 05");
  });
});

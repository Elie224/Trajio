import { describe, expect, it } from "vitest";

import { parseRetryAfter, retryAfterMinutes } from "./retry-after";

const NOW = Date.parse("2026-10-14T19:00:00Z");

describe("parseRetryAfter", () => {
  it("lit un nombre de secondes", () => {
    expect(parseRetryAfter("120", NOW)).toBe(120);
    expect(parseRetryAfter(" 0 ", NOW)).toBe(0);
  });

  it("lit une date HTTP", () => {
    expect(parseRetryAfter("Wed, 14 Oct 2026 19:05:00 GMT", NOW)).toBe(300);
  });

  it("ramene une date passee a 0", () => {
    expect(parseRetryAfter("Wed, 14 Oct 2026 18:00:00 GMT", NOW)).toBe(0);
  });

  it.each([null, undefined, "", "   ", "abc", "-5", "1.5", "12abc"])("rejette %j", (value) => {
    expect(parseRetryAfter(value, NOW)).toBeNull();
  });
});

describe("retryAfterMinutes", () => {
  it.each([
    [0, 1],
    [1, 1],
    [60, 1],
    [61, 2],
    [300, 5],
  ])("%i s -> %i min", (seconds, minutes) => {
    expect(retryAfterMinutes(seconds)).toBe(minutes);
  });
});

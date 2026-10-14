import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-redirect";

const ORIGIN = "http://localhost:3000";

function isSafe(result: string): boolean {
  if (result === "/trips") return true;
  if (!result.startsWith("/") || result.startsWith("//") || result.startsWith("/\\")) return false;
  return new URL(result, ORIGIN).origin === ORIGIN;
}

describe("safeNextPath - cas supplementaires (Tests)", () => {
  it.each([
    "/%5C/evil.com",
    "/%5c%5cevil.com",
    "/%2F/evil.com",
    "/%0A/evil.com",
    "/%09/evil.com",
    "/\n/evil.com",
    "/\t/evil.com",
    "/\r\n//evil.com",
    "/ /evil.com",
    "\\/evil.com",
    "/%2e%2e//evil.com",
  ])("%j reste sur l'origine ou retombe sur /trips", (raw) => {
    const out = safeNextPath(raw, ORIGIN);
    expect(isSafe(out), out).toBe(true);
  });

  it("une vraie nouvelle ligne ne produit pas //evil.com", () => {
    expect(safeNextPath("/\n/evil.com", ORIGIN)).toBe("/trips");
  });
});

import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-redirect";

const ORIGIN = "http://localhost:3000";

describe("safeNextPath", () => {
  it.each([
    ["/account", "/account"],
    ["/search?a=1#x", "/search?a=1"],
  ])("accepte %s -> %s", (raw, expected) => {
    expect(safeNextPath(raw, ORIGIN)).toBe(expected);
  });

  it.each([
    "//evil.com",
    "/\\evil.com",
    "/.//evil.com",
    "/..//evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "/login",
    "/login?next=/x",
    "",
    null,
    "account",
  ])("rejette %j -> /trips", (raw) => {
    expect(safeNextPath(raw, ORIGIN)).toBe("/trips");
  });

  it.each(["/%2F%2Fevil.com", "/\tevil.com"])("garde %j sur le meme site", (raw) => {
    const result = safeNextPath(raw, ORIGIN);
    expect(result.startsWith("/")).toBe(true);
    expect(result.startsWith("//")).toBe(false);
    expect(new URL(result, ORIGIN).origin).toBe(ORIGIN);
  });
});

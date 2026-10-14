import { expect, test } from "@playwright/test";

import { newAccount } from "./helpers";

const API = process.env.API_URL ?? "http://localhost:8100/api/v1";
const SHOTS = process.env.SHOTS_DIR ?? "/workspace/trajio-shots/round2";
const PASSWORD = "Dummy-Test-Pass-123!";
const RECENT = "trajio:recent-searches";

test("flag off: no 'Mot de passe oublié ?' link on /login", async ({ page }) => {
  test.skip(process.env.RESET_FLAG !== "off", "only for the build without the flag");
  await page.goto("/login");
  await expect(page.locator("#login-email")).toBeVisible();
  await expect(page.getByText("Mot de passe oublié ?")).toHaveCount(0);
  await expect(page.locator('a[href^="/forgot-password"]')).toHaveCount(0);
});

test.describe("flag on", () => {
  test.skip(process.env.RESET_FLAG === "off");

  test("reset-password button text is white, backdrop full screen on mobile", async ({ page }) => {
    await page.goto("/reset-password?token=dummy.e2e.token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const btn = page.locator('button[type="submit"]').first();
    await expect(btn).toBeVisible();
    expect(await btn.evaluate((b) => getComputedStyle(b).color)).toBe("rgb(255, 255, 255)");
  });

  test("deletion-preview 429 shows a clear message", async ({ page }) => {
    await newAccount(page.request);
    await page.goto("/account");
    let seen = 0;
    for (let i = 0; i < 7; i++) {
      await page.getByRole("button", { name: "Supprimer mon compte" }).click();
      const resp = await page.waitForResponse((r) => r.url().includes("deletion-preview"));
      if (resp.status() === 429) {
        seen++;
        const msg = page.locator("dialog[open]").getByText(/momentanément indisponible \(trop de demandes\)/);
        await expect(msg).toBeVisible();
        await expect(page.locator("dialog[open]").getByText(/Réessayez dans \d+ min/)).toBeVisible();
        break;
      }
      await page.keyboard.press("Escape");
    }
    expect(seen, "a 429 must occur within 6 openings").toBe(1);
  });

  test("header after client-side login, logout, deletion; recent searches storage", async ({ page }) => {
    const email = await newAccount(page.request);
    await page.context().clearCookies();
    const notes: string[] = [];
    await page.goto("/search");
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify([{ pickup: "Saint-Denis", dropoff: "Paris" }])), RECENT);
    await page.getByRole("link", { name: "Connexion" }).first().click();
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(PASSWORD);
    await page.getByRole("button", { name: /^Se connecter/ }).click();
    await page.waitForURL((u) => u.pathname !== "/login");
    await page.waitForTimeout(1500);
    const afterLogin = await page.getByRole("button", { name: "Déconnexion" }).count();
    notes.push(`after-login header shows Déconnexion without reload: ${afterLogin > 0}`);
    await page.reload();
    await page.getByRole("button", { name: "Déconnexion" }).first().click();
    await page.waitForLoadState("load");
    await page.waitForTimeout(1500);
    notes.push(`after-logout header shows Connexion: ${(await page.getByRole("link", { name: "Connexion" }).count()) > 0}`);
    notes.push(`after-logout ${RECENT} present: ${(await page.evaluate((k) => localStorage.getItem(k), RECENT)) !== null}`);
    // deletion
    const r = await page.request.post(`${API}/auth/login`, { data: { email, password: PASSWORD }, headers: { "X-Forwarded-For": "10.77.1.1" } });
    expect(r.status()).toBe(200);
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify([{ pickup: "Saint-Denis", dropoff: "Paris" }])), RECENT);
    await page.goto("/account");
    await page.getByRole("button", { name: "Supprimer mon compte" }).click();
    const d = page.locator("dialog[open]");
    await d.getByRole("button", { name: "Continuer" }).click();
    await d.locator("#delete-account-password").fill(PASSWORD);
    await d.getByRole("button", { name: "Supprimer définitivement" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    await page.waitForTimeout(1500);
    notes.push(`after-deletion header shows Connexion: ${(await page.getByRole("link", { name: "Connexion" }).count()) > 0}`);
    notes.push(`after-deletion ${RECENT} present: ${(await page.evaluate((k) => localStorage.getItem(k), RECENT)) !== null}`);
    console.log("OBSERVED\n" + notes.join("\n"));
  });

  for (const w of [1280, 375]) {
    test(`search screen at ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      const csp: string[] = [];
      const external: string[] = [];
      const tiles: number[] = [];
      page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()); });
      page.on("request", (rq) => {
        const u = new URL(rq.url());
        if (!["localhost", "127.0.0.1"].includes(u.hostname) && u.hostname !== "tile.openstreetmap.org") external.push(rq.url());
        if (/nominatim|geocod|photon|mapbox|google/i.test(rq.url())) external.push(rq.url());
      });
      page.on("response", (r) => { if (r.url().includes("tile.openstreetmap.org")) tiles.push(r.status()); });
      await page.goto("/search");
      await page.evaluate((k) => localStorage.setItem(k, JSON.stringify([
        { pickup: "Saint-Denis", dropoff: "Paris" }, { pickup: "Montreuil", dropoff: "Bastille" },
      ])), RECENT);
      await page.reload();
      await page.waitForTimeout(3000);
      const pickup = page.locator("#search-pickup");
      const dropoff = page.locator("#search-dropoff");
      await pickup.focus();
      await page.keyboard.press("ArrowDown");
      await expect(pickup).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("ArrowDown");
      const active = await pickup.getAttribute("aria-activedescendant");
      expect(active, "aria-activedescendant set").toBeTruthy();
      await page.screenshot({ path: `${SHOTS}/search-recent-${w}.png`, fullPage: true });
      await page.keyboard.press("Enter");
      const p1 = await pickup.inputValue();
      const d1 = await dropoff.inputValue();
      expect(p1.length > 0, `Enter picked a recent search (pickup=${p1}, dropoff=${d1})`).toBe(true);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Inverser départ et destination" }).click();
      await expect(pickup).toHaveValue(d1);
      await expect(dropoff).toHaveValue(p1);
      await page.screenshot({ path: `${SHOTS}/search-${w}.png`, fullPage: true });
      expect(csp, csp.join("\n")).toEqual([]);
      expect(external, external.join("\n")).toEqual([]);
      expect(tiles.length, "tiles requested").toBeGreaterThan(0);
      expect(tiles.every((s) => s === 200), `tiles ${tiles}`).toBe(true);
    });
  }

  test("mobile dialog backdrop covers the full viewport", async ({ page }) => {
    await newAccount(page.request);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/account");
    await page.getByRole("button", { name: "Supprimer mon compte" }).click();
    await page.waitForTimeout(500);
    const covers = await page.evaluate(() => {
      const el = document.elementFromPoint(187, 800);
      return el?.tagName;
    });
    // the top-layer dialog/backdrop must intercept clicks at the bottom of the screen
    expect(covers).toBe("DIALOG");
    await page.screenshot({ path: `${SHOTS}/account-mobile-backdrop-375.png` });
  });
});

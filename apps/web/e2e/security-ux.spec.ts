import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

const API = process.env.API_URL ?? "http://localhost:8100/api/v1";
const SHOTS = process.env.SHOTS_DIR ?? "/workspace/trajio-shots";
const PASSWORD = "Dummy-Test-Pass-123!";
let ipSeq = Math.floor(Math.random() * 60000);
const ip = () => `10.200.${(++ipSeq >> 8) & 255}.${ipSeq & 255}`;

function watchCsp(page: Page): string[] {
  const v: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) v.push(m.text());
  });
  page.on("pageerror", (e) => v.push(`pageerror: ${e.message}`));
  return v;
}

async function newAccount(req: APIRequestContext, withData = false): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const h = { "X-Forwarded-For": ip() };
  expect(
    (await req.post(`${API}/auth/register`, {
      data: { email, password: PASSWORD, first_name: "Test", last_name: "E2E" },
      headers: h,
    })).status(),
  ).toBe(201);
  expect(
    (await req.post(`${API}/auth/login`, { data: { email, password: PASSWORD }, headers: { "X-Forwarded-For": ip() } })).status(),
  ).toBe(200);
  if (withData) {
    const v = await (await req.post(`${API}/vehicles`, {
      data: { brand: "Test", model: "Car", plate: `E2E-${ipSeq}`, seats_total: 4 },
    })).json();
    const t = await req.post(`${API}/trips`, {
      data: {
        vehicle_id: v.id, origin_label: "Paris Gare de Lyon", destination_label: "Paris Bastille",
        origin_lat: 48.844, origin_lng: 2.374, destination_lat: 48.853, destination_lng: 2.369,
        departure_time: new Date(Date.now() + 2 * 86400e3).toISOString(), seats_total: 3,
      },
    });
    expect(t.status()).toBe(201);
  }
  return email;
}

test("CSP header and no CSP violations on /, /trips, /search (OSM tiles on map pages)", async ({ page }) => {
  const v = watchCsp(page);
  const tiles: number[] = [];
  page.on("response", (r) => { if (r.url().includes("tile.openstreetmap.org")) tiles.push(r.status()); });
  const res = await page.goto("/");
  expect(res!.headers()["content-security-policy"]).toContain("default-src 'self'");
  await newAccount(page.request);
  await page.waitForTimeout(3000);
  await page.goto("/trips");
  await page.waitForTimeout(1500);
  await page.goto("/search");
  await page.waitForTimeout(3000);
  expect(v, v.join("\n")).toEqual([]);
  expect(tiles.length, "OSM tiles requested").toBeGreaterThan(0);
  expect(tiles.every((s) => s === 200), `tile statuses ${tiles}`).toBe(true);
});

test("/reset-password strips token and sends Referrer-Policy: no-referrer", async ({ page }) => {
  const res = await page.goto("/reset-password?token=dummy.e2e.token");
  expect(res!.headers()["referrer-policy"]).toBe("no-referrer");
  await page.waitForLoadState("networkidle");
  expect(page.url()).not.toContain("dummy.e2e.token");
  expect(page.url()).not.toContain("token=");
  await page.goto("/forgot-password");
  for (const w of [1280, 375]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto("/forgot-password");
    await page.screenshot({ path: `${SHOTS}/forgot-password-${w}.png`, fullPage: true });
    await page.goto("/reset-password?token=dummy.e2e.token");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${SHOTS}/reset-password-${w}.png`, fullPage: true });
  }
});

test("anonymous /account shows 'Connexion requise' and no data", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/account");
  await expect(page.getByText("Connexion requise").first()).toBeVisible();
  await expect(page.getByText("Télécharger mes données")).toHaveCount(0);
  await expect(page.getByText("@example.com")).toHaveCount(0);
  await ctx.close();
});

test("account deletion dialog: a11y, 403, success, back/reload", async ({ page }) => {
  const v = watchCsp(page);
  const email = await newAccount(page.request, true);
  for (const w of [1280, 375]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto("/account");
    if (w === 1280) {
      const dl = page.waitForEvent("download");
      await page.getByRole("button", { name: "Télécharger mes données" }).click();
      await dl;
      await expect(page.getByText("Vos données ont été téléchargées.")).toBeVisible();
    }
    await page.getByRole("button", { name: "Supprimer mon compte" }).click();
    const dialog = page.locator("dialog[open]");
    await expect.soft(dialog.getByRole("button", { name: "Annuler" }), "focus on Annuler at open").toBeFocused();
    await expect(dialog.getByText(/1 trajet\(s\) à venir/)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/account-step1-counts-${w}.png`, fullPage: true });
    if (w === 1280) {
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        // Native modal <dialog>: page outside is inert; Chrome may move focus to
        // its own UI (activeElement = body), which is acceptable.
        const where = await page.evaluate(() => {
          const a = document.activeElement;
          if (!a || a === document.body) return "browser-ui";
          return a.closest("dialog[open]") ? "dialog" : `outside:${a.outerHTML.slice(0, 80)}`;
        });
        expect(where.startsWith("outside"), `Tab #${i + 1} -> ${where}`).toBe(false);
      }
    }
    await dialog.getByRole("button", { name: "Continuer" }).click();
    const pwd = dialog.locator("#delete-account-password");
    await expect(pwd).toBeFocused();
    const del = dialog.getByRole("button", { name: "Supprimer définitivement" });
    await expect(del).toBeDisabled();
    if (w === 1280) {
      await pwd.fill("something");
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      await page.getByRole("button", { name: "Supprimer mon compte" }).click();
      await dialog.getByRole("button", { name: "Continuer" }).click();
      await expect(pwd).toHaveValue("");
    }
    await pwd.fill("Wrong-Password-000!");
    await del.click();
    const err = dialog.getByText("Mot de passe incorrect");
    await expect(err).toBeVisible();
    const errId = await err.getAttribute("id");
    await expect(pwd).toHaveAttribute("aria-describedby", errId!);
    await expect(pwd).toHaveValue("");
    await expect(pwd).toBeFocused();
    await page.screenshot({ path: `${SHOTS}/account-step2-403-${w}.png`, fullPage: true });
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Supprimer mon compte" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("button", { name: "Continuer" }).click();
  await dialog.locator("#delete-account-password").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Supprimer définitivement" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByText("Votre compte a été supprimé.")).toBeVisible();
  await page.goBack();
  await page.reload();
  await expect(page.getByText("Connexion requise").first()).toBeVisible();
  await expect(page.getByText(email)).toHaveCount(0);
  expect(v, v.join("\n")).toEqual([]);
});

test("login 429 shows countdown message", async ({ page }) => {
  const email = `e2e-rl-${Date.now()}@example.com`;
  for (const w of [1280, 375]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto("/login");
    for (let i = 0; i < 6; i++) {
      await page.locator("#login-email").fill(email);
      await page.locator("#login-password").fill("Wrong-Password-000!");
      const btn = page.getByRole("button", { name: /^Se connecter/ });
      if (await btn.isDisabled()) break;
      await btn.click();
      await page.waitForResponse((r) => r.url().includes("/auth/login"));
    }
    await expect(page.getByText(/Trop de tentatives, réessayez dans \d+ minute/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Se connecter \(\d+:\d\d\)/ })).toBeDisabled();
    await page.screenshot({ path: `${SHOTS}/login-rate-limit-${w}.png`, fullPage: true });
  }
});

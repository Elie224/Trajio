import { expect, type Page, test } from "@playwright/test";

import { newAccount } from "./helpers";

const SHOTS = process.env.SHOTS_DIR ?? "/workspace/trajio-shots/round2";
const PASSWORD = "Dummy-Test-Pass-123!";
function watchCsp(page: Page): string[] {
  const v: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) v.push(m.text());
  });
  page.on("pageerror", (e) => v.push(`pageerror: ${e.message}`));
  return v;
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
  const res = await page.goto("/reset-password?token=dummy.e2e.token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  expect(res!.headers()["referrer-policy"]).toBe("no-referrer");
  await page.waitForLoadState("networkidle");
  expect(page.url()).not.toContain("dummy.e2e.token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  expect(page.url()).not.toContain("token=");
  await page.goto("/forgot-password");
  for (const w of [1280, 375]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto("/forgot-password");
    await page.screenshot({ path: `${SHOTS}/forgot-password-${w}.png`, fullPage: true });
    await page.goto("/reset-password?token=dummy.e2e.token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${SHOTS}/reset-password-${w}.png`, fullPage: true });
  }
});

test("anonymous /messages shows 'Connexion requise'", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/messages");
  await expect(page.getByText("Connexion requise").first()).toBeVisible();
  await expect(page.getByPlaceholder("Écrire un message")).toHaveCount(0);
  await ctx.close();
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
    await expect(dialog.getByRole("button", { name: "Annuler" }), "focus on Annuler at open").toBeFocused();
    await expect(dialog.getByText(/1 trajet à venir/)).toBeVisible();
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

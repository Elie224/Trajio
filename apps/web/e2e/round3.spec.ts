import { expect, test } from "@playwright/test";

const PASSWORD = "Dummy-Test-Pass-123!";
const RECENT = "trajio:recent-searches";
const SEED = JSON.stringify([{ pickup: "Saint-Denis", dropoff: "Paris" }]);

async function headerLoggedIn(page: import("@playwright/test").Page) {
  await expect(page.locator("header").getByRole("button", { name: "Déconnexion" }).locator("visible=true")).toBeVisible({ timeout: 5000 });
}

test("signup via UI, header logged in, logout clears recent searches, login again", async ({ page }) => {
  const email = `e2e-ui-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.locator("#signup-firstname").fill("Test");
  await page.locator("#signup-lastname").fill("UI");
  await page.locator("#signup-email").fill(email);
  await page.locator("#signup-password").fill(PASSWORD);
  await page.locator("#signup-password-confirm").fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((u) => u.pathname === "/trips");
  await expect.soft(page.locator("header").getByRole("button", { name: "Déconnexion" }).locator("visible=true"), "header after signup (no reload)").toBeVisible({ timeout: 5000 });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [RECENT, SEED]);
  await page.reload();
  await headerLoggedIn(page);
  await page.locator("header").getByRole("button", { name: "Déconnexion" }).locator("visible=true").click();
  await expect(page.locator("header").getByRole("link", { name: "Connexion" }).locator("visible=true")).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), RECENT), "recent after logout").toBeNull();
  // client-side login
  await page.locator("header").getByRole("link", { name: "Connexion" }).locator("visible=true").click();
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: /^Se connecter/ }).click();
  await page.waitForURL((u) => u.pathname !== "/login");
  await expect.soft(page.locator("header").getByRole("button", { name: "Déconnexion" }).locator("visible=true"), "header after client-side login (no reload)").toBeVisible({ timeout: 5000 });
  // deletion clears recent searches
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [RECENT, SEED]);
  await page.goto("/account");
  await page.getByRole("button", { name: "Supprimer mon compte" }).click();
  const d = page.locator("dialog[open]");
  await d.getByRole("button", { name: "Continuer" }).click();
  await d.locator("#delete-account-password").fill(PASSWORD);
  await d.getByRole("button", { name: "Supprimer définitivement" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  expect(await page.evaluate((k) => localStorage.getItem(k), RECENT), "recent after deletion").toBeNull();
});

test("API down: messages shown (no raw 'Failed to fetch')", async ({ page }) => {
  test.skip(process.env.API_DOWN !== "1", "run with the API stopped");
  const seen: Record<string, string> = {};
  const grab = async (k: string) => {
    seen[k] = (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 400);
  };
  await page.goto("/login");
  await page.locator("#login-email").fill("nobody@example.com");
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: /^Se connecter/ }).click();
  await page.waitForTimeout(1500);
  await grab("login");
  await page.goto("/signup");
  await page.locator("#signup-firstname").fill("T");
  await page.locator("#signup-lastname").fill("D");
  await page.locator("#signup-email").fill("nobody2@example.com");
  await page.locator("#signup-password").fill(PASSWORD);
  await page.locator("#signup-password-confirm").fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(1500);
  await grab("signup");
  await page.goto("/forgot-password");
  await page.locator('input[type="email"]').fill("nobody@example.com");
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(1500);
  await grab("forgot-password");
  for (const p of ["/account", "/trips", "/search"]) {
    await page.goto(p);
    await page.waitForTimeout(2000);
    await grab(p);
  }
  await page.locator("#search-pickup").fill("Paris");
  await page.locator("#search-dropoff").fill("Bastille");
  await page.getByRole("button", { name: "Rechercher" }).click();
  await page.waitForTimeout(1500);
  await grab("search-submit");
  console.log("APIDOWN " + JSON.stringify(seen, null, 1));
  const raw = Object.entries(seen).filter(([, t]) => /Failed to fetch|TypeError|NetworkError/i.test(t));
  expect(raw.map(([k]) => k), "pages showing a raw network error").toEqual([]);
});

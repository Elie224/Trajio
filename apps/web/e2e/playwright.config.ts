import { defineConfig } from "@playwright/test";

// Runs against an already started production build (`next start -p 3000`)
// and a live API on :8100. Dedicated throw-away accounts only.
export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: process.env.WEB_URL ?? "http://localhost:3000", trace: "off" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});

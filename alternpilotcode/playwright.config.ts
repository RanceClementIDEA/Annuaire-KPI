import { defineConfig } from "@playwright/test";
import fs from "fs";

const PORT = 3150;
// Chromium local (sandbox) si présent ; sinon celui installé par Playwright (CI).
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const launchOptions = fs.existsSync(CHROMIUM)
  ? { executablePath: CHROMIUM, args: ["--no-sandbox"] }
  : { args: ["--no-sandbox"] };

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 30_000,
  fullyParallel: false, // partage la base SQLite → séquentiel
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions,
  },
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

import { defineConfig, devices } from "@playwright/test";
import { loadTestProject } from "./scripts/test-env.mjs";

// Against the real backend the tests use the separate test project only, and start their own server
// built with its keys (never a running server that may point at production).
const REAL = process.env.E2E_BACKEND === "real";
if (REAL) {
  loadTestProject("Real-backend Playwright tests");
  if (process.env.E2E_BASE_URL) throw new Error("E2E_BACKEND=real starts its own test server; unset E2E_BASE_URL.");
}

const baseURL = REAL ? "http://localhost:3200" : (process.env.E2E_BASE_URL ?? "http://localhost:3100");

export default defineConfig({
  testDir: "./e2e",
  globalTeardown: "./e2e/global-teardown.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure", locale: "uz-UZ", timezoneId: "Asia/Tashkent" },
  projects: [
    // real backend (skipped without Supabase test keys)
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testMatch: /(core-flow|sharing)\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /\/mobile\.spec\.ts/ },
    // in-browser demo (/demo): runs anywhere, no keys needed
    { name: "demo", use: { ...devices["Desktop Chrome"] }, testMatch: /demo\/.*\.spec\.ts/ },
  ],
  webServer: REAL
    ? { command: "npx next build && npx next start -p 3200", url: baseURL, timeout: 400_000, reuseExistingServer: false, env: { NEXT_DIST_DIR: ".next-test" } }
    : process.env.E2E_BASE_URL
      ? undefined
      : { command: "npm run build && npx next start -p 3100", url: baseURL, timeout: 240_000, reuseExistingServer: true },
});

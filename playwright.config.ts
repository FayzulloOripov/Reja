import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.test.local" });
config({ path: ".env.local" });

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure", locale: "uz-UZ", timezoneId: "Asia/Tashkent" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run build && npx next start -p 3100", url: baseURL, timeout: 240_000, reuseExistingServer: true },
});

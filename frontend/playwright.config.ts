import { defineConfig, devices } from "@playwright/test";

// E2E smoke tests against the production build served by `vite preview`, which proxies /api to
// the FastAPI backend on :8000 (started here unless E2E_BASE_URL points at a running app, e.g.
// the live deployment). Locally, PW_CHANNEL=msedge uses the installed Edge instead of a
// downloaded Chromium.
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // One worker locally keeps memory use low; CI runners have room for two.
  workers: process.env.CI ? 2 : 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      grepInvert: /@mobile/,
    },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: external
    ? undefined
    : [
        {
          command: "uv run uvicorn app.main:app --host 127.0.0.1 --port 8000",
          cwd: "../backend",
          url: "http://127.0.0.1:8000/api/v1/health",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
          url: "http://127.0.0.1:4173",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      ],
});

import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running app with the demo content seeded:
 *
 *   npx supabase start …  &&  npx supabase db reset  &&  npm run seed
 *   npm run dev            (with JUDGE0_URL pointing at a Judge0 for the coding-lab test)
 *   npm run e2e
 *
 * The terminal test boots the REAL CheerpX engine and the public WebVM image,
 * so it needs internet access (design §4.13 "vm" project).
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});

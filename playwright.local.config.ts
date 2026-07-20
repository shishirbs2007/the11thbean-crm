import { baseConfig, chrome, defineConfig } from "./playwright.shared";

/**
 * Local write-enabled regression suite.
 *
 * Runs the full customer, visit, loyalty, event and communication lifecycles
 * against a Next.js server on this machine, backed by a local Supabase stack
 * carrying the same migrations as production. Fixtures are created and deleted
 * freely because nothing here is real.
 *
 * This is the temporary stand-in for a hosted staging environment. The guard in
 * tests/e2e/support/environment.ts still refuses to touch production.
 */
const PORT = Number(process.env.PLAYWRIGHT_LOCAL_PORT ?? 3100);
// Next.js derives redirect origins as "localhost", so the suite must use the
// same host or session cookies are dropped on the first redirect.
const baseURL = `http://localhost:${PORT}`;

const LOCAL_SUPABASE_URL =
  process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";

export default defineConfig({
  ...baseConfig(baseURL),
  globalSetup: "./tests/e2e/support/global-setup.ts",
  webServer: {
    command: `npx next start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.LOCAL_SUPABASE_ANON_KEY ?? "",
      SUPABASE_SERVICE_ROLE_KEY:
        process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ?? "",
    },
  },
  projects: [
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...chrome },
    },
    {
      name: "lifecycle",
      dependencies: ["auth-setup"],
      testMatch: /lifecycle\/.*\.spec\.ts/,
      use: {
        ...chrome,
        storageState: "playwright/.auth/user.json",
      },
    },
  ],
});

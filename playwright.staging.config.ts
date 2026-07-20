import { loadEnvConfig } from "@next/env";

import { baseConfig, chrome, defineConfig } from "./playwright.shared";

loadEnvConfig(process.cwd());

/**
 * Staging regression suite.
 *
 * Runs the full write-enabled customer, visit, loyalty, event and
 * communication lifecycles against a Vercel Preview deployment backed by the
 * staging Supabase project. The global setup refuses to start if the suite is
 * pointed anywhere near production.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL;

if (!baseURL) {
  throw new Error(
    "PLAYWRIGHT_BASE_URL must be set to the Vercel Preview deployment URL.",
  );
}

export default defineConfig({
  ...baseConfig(baseURL),
  globalSetup: "./tests/e2e/support/global-setup.ts",
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

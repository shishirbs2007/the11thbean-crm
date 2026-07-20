import { loadEnvConfig } from "@next/env";

import { baseConfig, chrome, defineConfig } from "./playwright.shared";

loadEnvConfig(process.cwd());

/**
 * Production smoke suite.
 *
 * Confirms availability, authentication, route rendering and critical reads
 * against the live site. Nothing here creates, edits or deletes business data;
 * the write-enabled regression suite runs against staging only.
 */
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL || "https://the11thbean-crm.vercel.app";

export default defineConfig({
  ...baseConfig(baseURL),
  projects: [
    {
      name: "public",
      testMatch: /smoke\/public\.spec\.ts/,
      use: { ...chrome },
    },
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...chrome },
    },
    {
      name: "auth-smoke",
      dependencies: ["auth-setup"],
      testMatch: /smoke\/authenticated\.spec\.ts/,
      use: {
        ...chrome,
        storageState: "playwright/.auth/user.json",
      },
    },
  ],
});

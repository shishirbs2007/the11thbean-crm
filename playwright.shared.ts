import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

/**
 * Settings common to the production smoke suite and the staging regression
 * suite. The two differ only in what they are allowed to do to the database,
 * so everything else lives here.
 */
export function baseConfig(baseURL: string): PlaywrightTestConfig {
  return {
    testDir: "./tests/e2e",
    outputDir: "test-results",
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 1,
    workers: 1,
    timeout: 45_000,
    expect: {
      timeout: 10_000,
    },
    reporter: [
      ["list"],
      [
        "html",
        {
          outputFolder: "playwright-report",
          open: "never",
        },
      ],
      [
        "junit",
        {
          outputFile: "test-results/results.xml",
        },
      ],
    ],
    use: {
      baseURL,
      actionTimeout: 15_000,
      navigationTimeout: 30_000,
      screenshot: "only-on-failure",
      trace: "retain-on-failure",
      video: "retain-on-failure",
    },
  };
}

export const chrome = devices["Desktop Chrome"];

export { defineConfig };

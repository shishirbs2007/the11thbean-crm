import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Anchor the project root to this directory so the bridge suite only ever runs
// its own tests, never the CRM's.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
  },
});

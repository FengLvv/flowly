import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 15000,
    // Windows Git/process fixtures become I/O-bound when every logical CPU
    // launches workers. Cap parallel children; retain all assertions/timeouts.
    maxWorkers: process.platform === "win32" ? 4 : undefined,
    exclude: [...configDefaults.exclude, "docs/verification/**", ".claude/**", ".test-data/**"],
    globalSetup: ["./server/testing/global-setup.mjs"],
    setupFiles: ["./server/testing/setup.ts"],
  },
});

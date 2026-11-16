import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 15000,
    exclude: [...configDefaults.exclude, "docs/verification/**", ".claude/**", ".test-data/**"],
    globalSetup: ["./server/testing/global-setup.mjs"],
    setupFiles: ["./server/testing/setup.ts"],
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure-logic tests run in Node; DOM tests opt in per-file with
    // `// @vitest-environment jsdom`.
    environment: "node",
    globals: true,
    include: ["test/**/*.test.js"],
    setupFiles: ["test/setup.js"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      reporter: ["text", "html"],
    },
  },
});

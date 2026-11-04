import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "modules/**/*.test.ts",
      "connectors/**/*.test.ts",
      "e2e/**/*.api.test.ts",
    ],
    environment: "node",
  },
});

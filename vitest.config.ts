import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/**/*.test.ts",
      "apps/**/*.test.ts",
      "modules/**/*.test.ts",
      "connectors/**/*.test.ts",
    ],
  },
});

import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vitest/config";

/** Mirrors the Wrangler `Text` rule: `import x from "./file.yaml"` yields the file contents. */
function yamlAsText(): Plugin {
  return {
    name: "yaml-as-text",
    load(id) {
      if (!id.endsWith(".yaml")) return null;
      return `export default ${JSON.stringify(readFileSync(id, "utf8"))};`;
    },
  };
}

export default defineConfig({
  plugins: [yamlAsText()],
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

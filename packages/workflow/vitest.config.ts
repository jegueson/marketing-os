import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vitest/config";

/** Same as the repo root: `import x from "./file.yaml"` yields file text. */
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
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

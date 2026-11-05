import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.open-next/**",
      "**/.wrangler/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "**/.cursor/**",
      "Planning/**",
      "docs/**",
      ".changeset/**",
      "apps/web/next-env.d.ts",
      "apps/web/open-next.config.ts",
      "packages/api-client/scripts/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);

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
  {
    rules: {
      // Intentional unused bindings: interface params, omit-via-destructure.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Playwright demo scripts: Node host + browser callbacks in page.evaluate.
    files: ["e2e/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        document: "readonly",
        window: "readonly",
        setTimeout: "readonly",
        URL: "readonly",
      },
    },
  },
);

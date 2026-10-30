import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.cursor/**",
      "Planning/**",
      "docs/**",
      ".changeset/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);

import { defineConfig } from "@playwright/test";

/** Runs against an already running stack; see tests/sprint1.spec.ts for the required env. */
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
});

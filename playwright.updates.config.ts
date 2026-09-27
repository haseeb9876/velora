import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "updates.spec.ts",
  workers: 1,
  timeout: 90000,
  use: { headless: true },
});

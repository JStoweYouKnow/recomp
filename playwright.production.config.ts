import { defineConfig } from "@playwright/test";

/** Run E2E tests against production. No webServer — assumes site is live. */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: process.env.BASE_URL ?? "https://recomp-one.vercel.app",
    headless: true,
  },
});

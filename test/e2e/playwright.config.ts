import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "http://localhost:5174",
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  // Don't start servers - assume dev.sh is already running
  webServer: undefined,
});

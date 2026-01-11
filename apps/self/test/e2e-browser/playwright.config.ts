import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  fullyParallel: false, // Run tests sequentially since they share server state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 60000,

  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
    video: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Web servers to start before running tests
  webServer: [
    {
      // Gateway (self-deno)
      command: "deno task start",
      cwd: "../..",
      url: "http://localhost:3000/openapi",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        BOOTSTRAP_API_KEY: "test-bootstrap-key-for-e2e",
        BLOB_STORAGE: "filesystem",
        BLOB_PATH: "./data/blobs",
        CORS_ORIGIN: "*",
      },
    },
    {
      // Org app (frame)
      command: "pnpm dev",
      cwd: "../../../org",
      url: "http://localhost:4321",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      // Demo app
      command: "pnpm dev",
      cwd: "../../../demo",
      url: "http://localhost:5174",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});

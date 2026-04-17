const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4317",
    trace: "on-first-retry",
    browserName: "chromium",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:4317",
    reuseExistingServer: true,
    timeout: 120000,
  },
});

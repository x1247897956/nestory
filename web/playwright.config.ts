import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:18080",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command:
          "env -u GOROOT APP_ADDR=127.0.0.1:18080 APP_DATA_DIR=/tmp/noteapp-e2e-data go run ./cmd/noteapp",
        cwd: "..",
        url: "http://127.0.0.1:18080/api/v1/readyz",
        reuseExistingServer: false,
        timeout: 120000,
      },
});

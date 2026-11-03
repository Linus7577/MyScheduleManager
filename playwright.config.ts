import { defineConfig, devices } from "@playwright/test";

const SHELL_PORT = 3100;
const GATE_PORT = 3101;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  projects: [
    {
      name: "shell-mobile",
      testMatch: "shell.spec.ts",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        baseURL: `http://localhost:${SHELL_PORT}`,
      },
    },
    {
      name: "shell-desktop",
      testMatch: "shell.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        baseURL: `http://localhost:${SHELL_PORT}`,
      },
    },
    {
      name: "gate",
      testMatch: "gate.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${GATE_PORT}` },
    },
  ],
  webServer: [
    {
      // Dev server with the preview flag, so the signed-in shell can be tested without a Google login.
      command: `npx next dev -p ${SHELL_PORT}`,
      url: `http://localhost:${SHELL_PORT}/login`,
      env: { AUTH_PREVIEW: "true" },
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      // Production build with the same flag set, to prove production ignores it.
      command: `npx next start -p ${GATE_PORT}`,
      url: `http://localhost:${GATE_PORT}/login`,
      env: { AUTH_PREVIEW: "true" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});

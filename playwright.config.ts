import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.join(rootDir, "frontend");
const pythonExe =
  process.platform === "win32"
    ? path.join(rootDir, "venv", "Scripts", "python.exe")
    : path.join(rootDir, "venv", "bin", "python");

export default defineConfig({
  testDir: path.join(rootDir, "tests", "e2e"),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `"${pythonExe}" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000`,
      url: "http://127.0.0.1:8000/api/health",
      cwd: rootDir,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "npm run dev",
      url: "http://127.0.0.1:5173",
      cwd: frontendDir,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});

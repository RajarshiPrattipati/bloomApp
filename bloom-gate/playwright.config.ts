import { defineConfig, devices } from '@playwright/test';

// E2E runs against WebKit (Safari's engine) on a mobile viewport — the closest
// headless approximation of the iOS Simulator target (PRD §6.2 E2E-1).
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'mobile-safari', use: { ...devices['iPhone 13'] } }],
  // Reuses the already-running `npm run dev` if present; otherwise starts it.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

import { defineConfig } from '@playwright/test';

const devPort = 43173;
const productionPort = 43174;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'gameplay',
      testMatch: 'gameplay.spec.ts',
      use: { baseURL: `http://127.0.0.1:${devPort}` },
    },
    {
      name: 'production',
      testMatch: 'smoke.spec.ts',
      use: { baseURL: `http://127.0.0.1:${productionPort}` },
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${devPort}`,
      url: `http://127.0.0.1:${devPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npm run preview -- --host 127.0.0.1 --port ${productionPort}`,
      url: `http://127.0.0.1:${productionPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '*.spec.ts',
  timeout: 30000,
  retries: 0,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,

  webServer: {
    command: 'node dist/index.js',
    port: 3000,
    timeout: 10000,
    reuseExistingServer: !process.env.CI,
    cwd: '.',
  },

  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});

import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  outputDir: '/tmp/airc-nexus-qa-01a1e25c/results',
  reporter: [['list']],
  use: {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1487, height: 1058 },
    deviceScaleFactor: 1,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    launchOptions: { chromiumSandbox: true },
  },
});

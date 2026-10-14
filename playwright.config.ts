import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  // One persistent browser context per test; the extension service worker isn't shared safely in parallel.
  workers: 1,
  timeout: 30_000,
  reporter: 'list',
});

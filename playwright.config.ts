import { defineConfig } from '@playwright/test';

const BROWSER_PORT = 4173;

/**
 * Two projects:
 * - electron: drives the built Electron app through e2e/support/launchApp.ts. Run it with
 *   `npm run e2e`, under `xvfb-run -a` on a machine without a display.
 * - browser: loads the static renderer build in Chromium. Run it with `npm run e2e:browser`.
 *
 * Both npm scripts build first, so a test never runs against a stale dist/.
 */
export default defineConfig({
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI !== undefined ? 1 : 0,
  // One Electron app at a time keeps the virtual display and CPU predictable.
  workers: 1,
  reporter: process.env.CI !== undefined ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'electron',
      testDir: './e2e',
      testIgnore: ['browser/**'],
    },
    {
      name: 'browser',
      testDir: './e2e/browser',
      use: { browserName: 'chromium', baseURL: `http://127.0.0.1:${BROWSER_PORT}` },
    },
  ],
  // Serves dist/renderer for the browser project. Playwright starts it for every run because
  // it has no per-project server. It is a static file server and starts in well under a second.
  webServer: {
    command: `npx vite preview --port ${BROWSER_PORT} --strictPort`,
    url: `http://127.0.0.1:${BROWSER_PORT}`,
    reuseExistingServer: process.env.CI === undefined,
    timeout: 30_000,
  },
});

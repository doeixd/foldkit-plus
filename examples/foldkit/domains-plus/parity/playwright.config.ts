/**
 * Upstream's Playwright suites, unchanged, against the port's built Worker:
 * `node parity/run.mjs` copies them beside the ported `api.ts` (into
 * `parity/.suite`, ignored) and runs this config.
 */
import { defineConfig, devices } from '@playwright/test'

const PORT = 5193
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './.suite/e2e',
  testMatch: ['**/domains.spec.ts', '**/domains.a11y.spec.ts', '**/domains.mobile.spec.ts'],
  fullyParallel: true,
  reporter: [['list'], ['json', { outputFile: './.suite/results.json' }]],
  use: { baseURL: BASE_URL, trace: 'off' },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: {
    command: `pnpm build && pnpm preview --ip 127.0.0.1 --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 240_000,
  },
})

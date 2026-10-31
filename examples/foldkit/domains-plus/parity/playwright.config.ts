/**
 * Upstream's Playwright suites, unchanged, against the port's built Worker:
 * `node parity/run.mjs` copies them beside the ported `api.ts` (into
 * `parity/.suite`, ignored) and runs this config.
 */
import { defineConfig, devices } from '@playwright/test'

// Another port (`PARITY_PORT`) keeps a run off a preview already serving an older build.
const PORT = Number(process.env['PARITY_PORT'] ?? 5193)
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './.suite/e2e',
  testMatch: ['**/domains.spec.ts', '**/domains.a11y.spec.ts', '**/domains.mobile.spec.ts'],
  fullyParallel: true,
  reporter: [['list'], ['json', { outputFile: './.suite/results.json' }]],
  use: { baseURL: BASE_URL, trace: 'off' },
  // Upstream's two; `--project chromium` or `--project webkit` runs one.
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --ip 127.0.0.1 --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 240_000,
  },
})

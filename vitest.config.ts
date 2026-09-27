import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'
import { inBrowser, shared } from './vitest.shared.js'

const everywhere = ['packages/*/test/**/*.test.ts', 'examples/*/test/**/*.test.ts']
const browserTests = [
  'packages/*/test/**/*.browser.test.ts',
  'examples/*/test/**/*.browser.test.ts',
]

export default defineConfig({
  test: {
    projects: [
      mergeConfig(shared, {
        test: {
          name: 'unit',
          include: everywhere,
          exclude: [...browserTests, '**/node_modules/**'],
        },
      }),
      // What jsdom cannot check: layout, focus, the caret. Headless Chromium,
      // at a desktop size, so a full-screen layout is the one users see.
      mergeConfig(inBrowser, {
        // Bundled before the run: found during it, Vite reloads, and the test file that
        // met it fails to import (the CMS sandbox's SQLite, a CommonJS package).
        optimizeDeps: { include: ['foldkit-example-cms > sql.js'] },
        test: {
          name: 'browser',
          include: browserTests,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium', viewport: { width: 1440, height: 900 } }],
          },
        },
      }),
    ],
  },
})

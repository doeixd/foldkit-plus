import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'
import { inBrowser, shared } from './vitest.shared.js'

const everywhere = [
  'packages/*/test/**/*.test.ts',
  'examples/*/test/**/*.test.ts',
  'examples/foldkit/*/test/**/*.test.ts',
]
const browserTests = [
  'packages/*/test/**/*.browser.test.ts',
  'examples/*/test/**/*.browser.test.ts',
  'examples/foldkit/*/test/**/*.browser.test.ts',
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

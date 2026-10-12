import { availableParallelism, freemem } from 'node:os'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'
import { inBrowser, shared } from './vitest.shared.js'

const everywhere = [
  'packages/*/test/**/*.test.ts',
  'examples/*/test/**/*.test.ts',
  'examples/foldkit/*/test/**/*.test.ts',
  'scripts/test/**/*.test.ts',
]
const browserTests = [
  'packages/*/test/**/*.browser.test.ts',
  'examples/*/test/**/*.browser.test.ts',
  'examples/foldkit/*/test/**/*.browser.test.ts',
]

/**
 * Workers by the memory free when the run starts, not by cores alone. On a
 * 16-core machine with 4 GiB free (2026-10-12), a worker per core less one
 * ran out of memory and was killed; at 0.75 GiB each (5 workers), the whole
 * suite peaked 5.1 GiB over its start, Chromium included, and finished in
 * seven minutes. `--maxWorkers` still wins.
 */
const maxWorkers = Math.max(
  1,
  Math.min(availableParallelism() - 1, Math.floor(freemem() / (0.75 * 2 ** 30))),
)

export default defineConfig({
  test: {
    maxWorkers,
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
          // The benchmarks measure Node; several cannot load in a page at all.
          benchmark: { include: [] },
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

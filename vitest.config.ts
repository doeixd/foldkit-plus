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
 * Tests of a coarse pointer, on a page that is a touch screen from the start.
 * Touch emulation cannot be undone in a page: on Linux, Chromium turned off
 * again reports `pointer: none`, and every later file in that page lost its
 * fine pointer.
 */
const touchTests = browserTests.map(pattern => pattern.replace('.browser.', '.touch.browser.'))

const browser = (contextOptions: { readonly hasTouch: boolean }) => ({
  enabled: true,
  headless: true,
  provider: playwright({ contextOptions }),
  instances: [{ browser: 'chromium' as const, viewport: { width: 1440, height: 900 } }],
})

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
          exclude: [...touchTests, '**/node_modules/**'],
          // The benchmarks measure Node; several cannot load in a page at all.
          benchmark: { include: [] },
          browser: browser({ hasTouch: false }),
        },
      }),
      // The upstream foldkit-domains copy keeps its own test setup (happy-dom,
      // Foldkit's Vitest setup, tests beside the source), as upstream runs it.
      'examples/foldkit/domains/vitest.config.ts',
      mergeConfig(inBrowser, {
        test: {
          name: 'browser-touch',
          include: touchTests,
          benchmark: { include: [] },
          browser: browser({ hasTouch: true }),
        },
      }),
    ],
  },
})

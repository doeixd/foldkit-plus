/**
 * `pnpm e2e`: the examples with a server, end to end. Each test starts the
 * example's server and its Vite dev server, then drives a real Chromium with
 * Playwright. Kept out of `pnpm test`, which never starts a server.
 */
import { defineConfig, mergeConfig } from 'vitest/config'
import { budgetsElsewhere, perfTests, shared } from './vitest.shared.js'

/**
 * The site's adoption check builds production and takes 8.6 of the suite's 35
 * minutes, so CI runs it in a job of its own (`FOLDKIT_ADOPTION=1`, naming the
 * file) and leaves it out of the `--shard` jobs; locally it stays in `pnpm e2e`.
 */
const adoption = 'examples/site/e2e/adoption.e2e.ts'
const adoptionElsewhere = process.env.CI !== undefined && !process.env.FOLDKIT_ADOPTION

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      include: ['examples/*/e2e/**/*.e2e.ts', 'examples/foldkit/*/e2e/**/*.e2e.ts'],
      exclude: [
        ...(budgetsElsewhere ? perfTests.e2e : []),
        ...(adoptionElsewhere ? [adoption] : []),
        '**/node_modules/**',
      ],
      // A first load pre-bundles the workspace packages, which takes a while.
      testTimeout: 180_000,
      hookTimeout: 180_000,
      // One retry on shared CI runners for server-startup or Chromium hiccups; 0 locally.
      retry: process.env.CI !== undefined ? 1 : 0,
      // One example at a time: each starts servers and a browser.
      fileParallelism: false,
    },
  }),
)

/**
 * `pnpm e2e`: the examples with a server, end to end. Each test starts the
 * example's server and its Vite dev server, then drives a real Chromium with
 * Playwright. Kept out of `pnpm test`, which never starts a server.
 */
import { defineConfig, mergeConfig } from 'vitest/config'
import { shared } from './vitest.shared.js'

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      include: ['examples/*/e2e/**/*.e2e.ts'],
      // A first load pre-bundles the workspace packages, which takes a while.
      testTimeout: 180_000,
      hookTimeout: 180_000,
      // One example at a time: each starts servers and a browser.
      fileParallelism: false,
    },
  }),
)

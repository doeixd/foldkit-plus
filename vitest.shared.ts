/**
 * What every Vitest run in this repository shares, from the root or from a
 * package: workspace packages resolve to their source through the
 * `foldkit-plus:source` export condition, so a test never runs against a
 * stale build.
 */
import { defaultClientConditions } from 'vite'
import { defineConfig } from 'vitest/config'
import { mutation } from './scripts/mutation-plugin.mjs'
import { alias, inNode } from './scripts/test-resolve.mjs'
import { icons } from './packages/media/src/vite/icons.js'

/**
 * The performance budgets (#425). CPU readings need a quiet Linux machine and
 * a shared test shard is neither, so on CI they run only in the `perf` job
 * (`FOLDKIT_PERF=1`) and are left out of the shards and of `pnpm e2e`;
 * locally they stay in `pnpm test`.
 */
export const perfTests = {
  unit: [
    'examples/foldkit/domains-plus/test/cpu.test.ts',
    'examples/foldkit/domains-plus/test/bundle.test.ts',
    'examples/foldkit/domains-plus/test/serverBundle.test.ts',
    'examples/chirp/test/cpu.test.ts',
    'examples/cloudflare/test/cpu.test.ts',
    'examples/cloudflare/test/serverBundle.test.ts',
  ],
  e2e: ['examples/foldkit/domains-plus/e2e/layoutShift.e2e.ts'],
} as const

/** Whether the budgets are left to the `perf` job: on CI, outside it. */
export const budgetsElsewhere =
  process.env.CI !== undefined && process.env.FOLDKIT_PERF === undefined

/** For tests in Node or jsdom. */
export const shared = defineConfig({
  plugins: [mutation()],
  resolve: { conditions: inNode, alias },
  ssr: { resolve: { conditions: inNode } },
})

/**
 * For tests in a real browser: Vite's client conditions, `browser` included.
 * A separate value rather than an override of `shared`, since merging Vite
 * configs concatenates arrays, and the Node conditions would stay.
 */
export const inBrowser = defineConfig({
  // Lucide's icons by name, as an example's own Vite config gives them, so a
  // test can draw the example's page (`examples/chirp`). From source, by path:
  // a package import of the plugin would run its `dist`, or none on CI.
  plugins: [mutation(), icons({ iconify: ['lucide'], dts: false })],
  resolve: { conditions: ['foldkit-plus:source', ...defaultClientConditions], alias },
})

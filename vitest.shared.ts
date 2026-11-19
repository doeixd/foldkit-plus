/**
 * What every Vitest run in this repository shares, from the root or from a
 * package: workspace packages resolve to their source through the
 * `foldkit-plus:source` export condition, so a test never runs against a
 * stale build.
 */
import { foldkit } from '@foldkit/vite-plugin'
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

/**
 * The tests that make a production build of a page or a package. Run beside
 * the rest in one shard, they starved CI's runner of memory until it lost
 * contact with GitHub (PR #564's fourth shard), so on CI they run in the
 * `builds` job (`FOLDKIT_BUILDS=1`) with few workers, or the `prerender` job; locally they stay in
 * `pnpm test`.
 */
export const buildTests = [
  'examples/**/test/bundle.test.ts',
  'examples/auth/test/{boot,split}.test.ts',
  'scripts/test/{readOnlyPage,publishedBuild}.test.ts',
  // Prerenders the whole site: 10 of the 12.5 minutes of the shard that held it.
  'examples/site/test/prerender.test.ts',
] as const

/**
 * Whether the build tests are left to the `builds` job: on CI, outside it and
 * the `perf` job, which builds its own budgets.
 */
export const buildsElsewhere =
  process.env.CI !== undefined &&
  process.env.FOLDKIT_BUILDS === undefined &&
  process.env.FOLDKIT_PERF === undefined

/**
 * The two Node unit files that launch Chromium themselves via Playwright.
 * On CI they run alongside `browser-touch` (`FOLDKIT_PLAYWRIGHT_UNIT=1`) so
 * none of the `unit` shards need to install Chromium or its OS packages.
 */
export const playwrightUnitTests = [
  'packages/mixins-data-grid/test/branded.test.ts',
  'packages/plus/test/playwright.test.ts',
] as const

export const playwrightUnitElsewhere =
  process.env.CI !== undefined && process.env.FOLDKIT_PLAYWRIGHT_UNIT === undefined

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
  //
  // Foldkit's plugin brands each node with the function that returned it, and the
  // differ replaces a node whose brand changed, as an application's build does
  // with this workspace's source. Without it a node replaced that way passes every
  // test: the data grid's funnel came from one arrow shut and another open, so
  // opening its form dropped the focus and closed it (AGENTS.md, "A node returned
  // from a different function is replaced"). The unit project and an installed
  // package are not branded.
  plugins: [mutation(), foldkit(), icons({ iconify: ['lucide'], dts: false })],
  resolve: { conditions: ['foldkit-plus:source', ...defaultClientConditions], alias },
})

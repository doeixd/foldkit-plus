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
  plugins: [mutation()],
  resolve: { conditions: ['foldkit-plus:source', ...defaultClientConditions], alias },
})

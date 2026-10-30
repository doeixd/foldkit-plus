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

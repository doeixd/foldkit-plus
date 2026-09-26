/**
 * What every Vitest run in this repository shares, from the root or from a
 * package: workspace packages resolve to their source through the
 * `foldkit-plus:source` export condition, so a test never runs against a
 * stale build.
 */
import { fileURLToPath } from 'node:url'
import { defaultServerConditions } from 'vite'
import { defineConfig } from 'vitest/config'

// Vitest's own default for every environment, jsdom included, with the source
// condition first. It drops `module`: a package's `module` build may use
// extensionless imports Node cannot load (`@opentelemetry/api` does). Vite's
// client defaults would add `browser`, which resolves `ws` to its browser stub.
const conditions = [
  'foldkit-plus:source',
  ...defaultServerConditions.filter(condition => condition !== 'module'),
]

export const shared = defineConfig({
  resolve: {
    conditions,
    alias: {
      // Vite's client environment (the jsdom tests) refuses to bundle a Node
      // builtin, so a static `node:sqlite` import resolves to this shim under
      // Vitest. Node and tsx still resolve the real builtin.
      'node:sqlite': fileURLToPath(new URL('./test-support/sqlite.ts', import.meta.url)),
    },
  },
  ssr: { resolve: { conditions } },
})

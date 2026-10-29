/**
 * How a test in Node or jsdom resolves modules: workspace packages through
 * their `foldkit-plus:source` condition, so a test never runs against a stale
 * build. `vitest.shared.ts` gives it to every Vitest run, and a test that
 * loads modules through a Vite server of its own gives it to that server
 * (`examples/site/test/prerender.worker.mjs`).
 */
import { fileURLToPath } from 'node:url'
import { defaultServerConditions } from 'vite'

// Vitest's own default for Node and jsdom, with the source condition first. It
// drops `module`: a package's `module` build may use extensionless imports Node
// cannot load (`@opentelemetry/api` does). Vite's client defaults would add
// `browser`, which resolves `ws` to its browser stub.
export const inNode = [
  'foldkit-plus:source',
  ...defaultServerConditions.filter(condition => condition !== 'module'),
]

export const alias = {
  // Vite's client environment (the jsdom tests) refuses to bundle a Node
  // builtin, so a static `node:sqlite` import resolves to this shim under
  // Vitest. Node and tsx still resolve the real builtin.
  'node:sqlite': fileURLToPath(new URL('../test-support/sqlite.ts', import.meta.url)),
}

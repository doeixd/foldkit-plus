/**
 * What every Vitest run in this repository shares, from the root or from a
 * package: workspace packages resolve to their source through the
 * `foldkit-plus:source` export condition, so a test never runs against a
 * stale build.
 */
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultClientConditions, defaultServerConditions, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

const source = 'foldkit-plus:source'

const alias = {
  // Vite's client environment (the jsdom tests) refuses to bundle a Node
  // builtin, so a static `node:sqlite` import resolves to this shim under
  // Vitest. Node and tsx still resolve the real builtin.
  'node:sqlite': fileURLToPath(new URL('./test-support/sqlite.ts', import.meta.url)),
}

// Vitest's own default for Node and jsdom, with the source condition first. It
// drops `module`: a package's `module` build may use extensionless imports Node
// cannot load (`@opentelemetry/api` does). Vite's client defaults would add
// `browser`, which resolves `ws` to its browser stub.
const inNode = [source, ...defaultServerConditions.filter(condition => condition !== 'module')]

/** One edit of a mutation, as `pnpm mutate` (`scripts/mutate.mjs`) sends it. */
interface MutationEdit {
  readonly file: string
  readonly find: string
  readonly replace: string
  readonly all: boolean
}

// Vite's ids use forward slashes and keep a query; Windows paths are case-blind.
const pathOf = (id: string) =>
  resolve(id.split('?')[0]!).split(String.fromCharCode(92)).join('/').toLowerCase()

/**
 * `pnpm mutate`'s edits, applied to modules as Vite loads them, never to the
 * files: a crash leaves nothing mutated, and another session in the worktree
 * sees the source as it is. Each edit that applies is recorded in the marker
 * file, so the runner can tell a mutation that never reached a module from
 * one the tests survived. Without `FOLDKIT_MUTATION` it does nothing.
 */
const mutation = (): Plugin => {
  const raw = process.env['FOLDKIT_MUTATION']
  const marker = process.env['FOLDKIT_MUTATION_MARKER']
  if (raw === undefined || marker === undefined) return { name: 'foldkit-mutation' }
  const edits: ReadonlyArray<MutationEdit> = JSON.parse(raw)
  return {
    name: 'foldkit-mutation',
    enforce: 'pre',
    transform: (code, id) => {
      const path = pathOf(id)
      let next = code
      edits.forEach((edit, index) => {
        if (pathOf(edit.file) !== path || !next.includes(edit.find)) return
        next = edit.all
          ? next.split(edit.find).join(edit.replace)
          : next.replace(edit.find, edit.replace)
        appendFileSync(marker, `${index}${String.fromCharCode(10)}`)
      })
      return next === code ? undefined : next
    },
  }
}

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
  resolve: { conditions: [source, ...defaultClientConditions], alias },
})

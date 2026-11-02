/**
 * `pnpm mutate`'s edits, applied to modules as Vite loads them, never to the
 * files: a crash leaves nothing mutated, and another session in the worktree
 * sees the source as it is. Each edit that applies is recorded in the marker
 * file, so the runner (`mutate.mjs`) can tell a mutation that never reached a
 * module from one the tests survived. Without `FOLDKIT_MUTATION` it does
 * nothing.
 *
 * `vitest.shared.ts` gives it to every test run. A test that runs a Vite
 * build of its own passes it too, so a mutation reaches that build
 * (`examples/auth/test/split.test.ts`); a Worker esbuild bundles takes
 * `workerMutation` (`examples/cloudflare/src/stack.ts`).
 */
import { appendFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Vite's ids use forward slashes and keep a query; Windows paths are case-blind.
const pathOf = id => resolve(id.split('?')[0]).split(String.fromCharCode(92)).join('/').toLowerCase()

/** @returns {import('vite').Plugin} */
export const mutation = () => {
  const raw = process.env['FOLDKIT_MUTATION']
  const marker = process.env['FOLDKIT_MUTATION_MARKER']
  if (raw === undefined || marker === undefined) return { name: 'foldkit-mutation' }
  const edits = JSON.parse(raw)
  return {
    name: 'foldkit-mutation',
    enforce: 'pre',
    transform: (code, id) => edited(code, id, edits, marker),
  }
}

/**
 * The same edits, for a Worker esbuild bundles (`Stack`'s `plugins`), which
 * Vite never loads.
 *
 * @returns {import('esbuild').Plugin}
 */
export const workerMutation = () => ({
  name: 'foldkit-mutation',
  setup: build => {
    const raw = process.env['FOLDKIT_MUTATION']
    const marker = process.env['FOLDKIT_MUTATION_MARKER']
    if (raw === undefined || marker === undefined) return
    const edits = JSON.parse(raw)
    build.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
      const contents = edited(await readFile(path, 'utf8'), path, edits, marker)
      return contents === undefined ? undefined : { contents, loader: 'ts' }
    })
  },
})

/**
 * `code` with each edit for `id` applied, recording each that applied in
 * `marker`; undefined when none did.
 *
 * @param {string} code
 * @param {string} id
 * @param {ReadonlyArray<{ file: string, find: string, replace: string, all: boolean }>} edits
 * @param {string} marker
 */
const edited = (code, id, edits, marker) => {
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
}

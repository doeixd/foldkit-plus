/**
 * `pnpm mutate`'s edits, applied to the Worker's sources as esbuild bundles
 * them, as `vitest.shared.ts` applies them to what Vite loads: the stack's
 * bundle is esbuild's, so that plugin never reaches it. Each edit that applies
 * is recorded in the marker file. Without `FOLDKIT_MUTATION` it does nothing,
 * so the deploy bundle is the tests' bundle.
 */
import type { Plugin } from 'esbuild'
import { appendFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

/** One edit of a mutation, as `pnpm mutate` (`scripts/mutate.mjs`) sends it. */
interface MutationEdit {
  readonly file: string
  readonly find: string
  readonly replace: string
  readonly all: boolean
}

// esbuild's paths and the runner's differ in separators and, on Windows, case.
const pathOf = (path: string) => resolve(path).split(sep).join('/').toLowerCase()

export const mutation = (): Plugin => ({
  name: 'foldkit-mutation',
  setup: build => {
    const raw = process.env['FOLDKIT_MUTATION']
    const marker = process.env['FOLDKIT_MUTATION_MARKER']
    if (raw === undefined || marker === undefined) return
    const edits: ReadonlyArray<MutationEdit> = JSON.parse(raw)
    build.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
      const code = await readFile(path, 'utf8')
      let next = code
      edits.forEach((edit, index) => {
        if (pathOf(edit.file) !== pathOf(path) || !next.includes(edit.find)) return
        next = edit.all
          ? next.split(edit.find).join(edit.replace)
          : next.replace(edit.find, edit.replace)
        appendFileSync(marker, `${index}\n`)
      })
      return next === code ? undefined : { contents: next, loader: 'ts' }
    })
  },
})

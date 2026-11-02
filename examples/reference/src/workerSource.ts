/**
 * The Worker's sources as esbuild bundles them, made the page's twins: each
 * view brands what it returns, as `@foldkit/vite-plugin` brands the page's
 * build, and `pnpm mutate`'s edits are applied.
 *
 * Foldkit adopts a served element only where its view identity is the one
 * the browser's view gives it. Bundled without the brand, the Worker drew
 * every page with none, and the browser, whose views carry theirs, rebuilt
 * the whole root on every hydration: in production silently, in development
 * with "The server DOM did not match the first client view".
 *
 * The edits are applied as `vitest.shared.ts` applies them to what Vite
 * loads, since the stack's bundle is esbuild's and that plugin never reaches
 * it; each one that applies is recorded in the marker file. Without
 * `FOLDKIT_MUTATION` nothing is edited, so the deploy bundle is the tests'.
 */
import { transformViewIdentity } from '@foldkit/vite-plugin'
import { transform, type Plugin } from 'esbuild'
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

/** `code` with each of `edits` for `path` applied, recording which applied in `marker`. */
const edited = (
  code: string,
  path: string,
  edits: ReadonlyArray<MutationEdit>,
  marker: string | undefined,
): string =>
  edits.reduce((next, edit, index) => {
    if (marker === undefined || pathOf(edit.file) !== pathOf(path) || !next.includes(edit.find))
      return next
    appendFileSync(marker, `${index}\n`)
    return edit.all
      ? next.split(edit.find).join(edit.replace)
      : next.replace(edit.find, edit.replace)
  }, code)

/** The plugin, for a page whose Vite root is `root`: identities are module paths from there. */
export const workerSource = (root: string): Plugin => ({
  name: 'reference-worker-source',
  setup: build => {
    const raw = process.env['FOLDKIT_MUTATION']
    const marker = process.env['FOLDKIT_MUTATION_MARKER']
    const edits: ReadonlyArray<MutationEdit> = raw === undefined ? [] : JSON.parse(raw)
    build.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
      if (pathOf(path).includes('/node_modules/')) return undefined
      const source = edited(await readFile(path, 'utf8'), path, edits, marker)
      // The brand reads JavaScript, as Vite hands it over after its own TypeScript pass.
      const { code } = await transform(source, { loader: 'ts', format: 'esm', sourcefile: path })
      const branded = transformViewIdentity(code, path, root, { isFoldkitCoreResolved: true })
      return { contents: branded?.code ?? code, loader: 'js' }
    })
  },
})

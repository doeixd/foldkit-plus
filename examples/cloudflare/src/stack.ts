/**
 * The local Cloudflare stack for the test and the demo: the example worker
 * bundled, served by miniflare over real HTTP with a Durable Object and D1.
 * Remote goes through real `fetch`, so streaming bodies behave as they do
 * deployed; only Sync upgrades ride `dispatchFetch`, which hands back the
 * client socket directly.
 */
import { build, type Plugin } from 'esbuild'
import { Miniflare } from 'miniflare'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { appendFileSync } from 'node:fs'
import { basename, dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url))

export type StackDatabase = Awaited<ReturnType<Miniflare['getD1Database']>>

export interface CloudflareStack {
  readonly mf: Miniflare
  readonly origin: string
  readonly db: StackDatabase
  readonly stop: () => Promise<void>
}

/** One edit of a mutation, as `pnpm mutate` (`scripts/mutate.mjs`) sends it. */
interface MutationEdit {
  readonly file: string
  readonly find: string
  readonly replace: string
  readonly all: boolean
}

// esbuild's paths and the runner's differ in separators and, on Windows, case.
const pathOf = (path: string) => resolve(path).split(sep).join('/').toLowerCase()

/**
 * `pnpm mutate`'s edits, applied to the worker's sources as esbuild bundles
 * them, as `vitest.shared.ts` applies them to what Vite loads: this bundle is
 * esbuild's, so that plugin never reaches it. Each edit that applies is
 * recorded in the marker file. Without `FOLDKIT_MUTATION` it does nothing.
 */
const mutation = (): Plugin => ({
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

/** Where `wrangler deploy` reads the worker (`main` in `wrangler.toml`). */
const outfile = here('../dist/worker.js')

/**
 * The worker esbuild produces, for miniflare and for `wrangler deploy`: the
 * script, and beside it the Argon2 Wasm module Yielded hashes passwords with,
 * which a Worker imports as a compiled module. Yielded's scrypt imports
 * `node:crypto`, so the worker runs with `nodejs_compat`.
 */
const bundleWorker = () =>
  build({
    entryPoints: [here('./worker.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    conditions: ['foldkit-plus:source'],
    external: ['cloudflare:workers', 'node:*'],
    loader: { '.wasm': 'copy' },
    plugins: [mutation()],
    outdir: dirname(outfile),
    entryNames: basename(outfile, '.js'),
    write: false,
    logLevel: 'silent',
  })

const isWasm = (path: string) => path.endsWith('.wasm')

/** Writes the bundle where `wrangler deploy` reads it. */
export const writeWorker = async () => {
  const { outputFiles } = await bundleWorker()
  await mkdir(dirname(outfile), { recursive: true })
  for (const file of outputFiles) await writeFile(file.path, file.contents)
}

/**
 * The migrations `wrangler d1 migrations apply` runs, in order, so the local
 * database is the deployed one's. Each holds one statement per line.
 */
const migrate = async (db: StackDatabase) => {
  const directory = here('../migrations/')
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    const text = await readFile(`${directory}${file}`, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const statement = line.trim()
      if (statement !== '' && !statement.startsWith('--')) await db.exec(statement)
    }
  }
}

/** The upload secret the local stack runs with, new each run; a deployment sets its own. */
export const UPLOAD_TOKEN = crypto.randomUUID()

/**
 * The page origin the local stack's auth trusts (`AUTH_ORIGIN`). Nothing
 * listens there: a test sends it as `Origin`, as that page would.
 */
export const PAGE_ORIGIN = 'http://127.0.0.1:5177'

export const startStack = async (): Promise<CloudflareStack> => {
  const { outputFiles } = await bundleWorker()
  const mf = new Miniflare({
    // The script first: miniflare runs the first module as the entry.
    modules: [
      ...outputFiles.filter(file => !isWasm(file.path)),
      ...outputFiles.filter(file => isWasm(file.path)),
    ].map(file => ({
      type: isWasm(file.path) ? ('CompiledWasm' as const) : ('ESModule' as const),
      path: file.path,
      contents: file.contents,
    })),
    modulesRoot: dirname(outfile),
    durableObjects: { SYNC_HOST: 'SyncHost' },
    d1Databases: ['DB'],
    r2Buckets: ['MEDIA'],
    images: { binding: 'IMAGES' },
    ratelimits: { LIMITER: { namespace_id: '1001', simple: { limit: 100, period: 60 } } },
    bindings: { UPLOAD_TOKEN, AUTH_ORIGIN: PAGE_ORIGIN },
    // Near `wrangler.toml`'s date (the latest this workerd knows): an old one
    // lacks `URL.canParse`, which the auth resolver checks its origins with,
    // and stream constructors, on by default since 2022.
    compatibilityDate: '2026-07-30',
    compatibilityFlags: ['nodejs_compat'],
    host: '127.0.0.1',
    port: 0,
  })
  const origin = (await mf.ready).origin
  const db = await mf.getD1Database('DB')
  await migrate(db)
  return { mf, origin, db, stop: () => mf.dispose() }
}

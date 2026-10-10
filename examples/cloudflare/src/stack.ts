/**
 * The local Cloudflare stack for the test and the demo: the example worker
 * bundled, served by miniflare over real HTTP with a Durable Object and D1.
 * Remote goes through real `fetch`, so streaming bodies behave as they do
 * deployed; only Sync upgrades ride `dispatchFetch`, which hands back the
 * client socket directly.
 */
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url))

export type StackDatabase = Awaited<ReturnType<Miniflare['getD1Database']>>

export interface CloudflareStack {
  readonly mf: Miniflare
  readonly origin: string
  readonly db: StackDatabase
  readonly stop: () => Promise<void>
}

/** The worker esbuild produces, for miniflare and for `wrangler deploy`. */
export const bundleWorker = (outfile?: string) =>
  build({
    entryPoints: [here('./worker.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    conditions: ['foldkit-plus:source'],
    external: ['cloudflare:workers'],
    write: outfile !== undefined,
    ...(outfile === undefined ? {} : { outfile }),
    logLevel: 'silent',
  })

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

export const startStack = async (): Promise<CloudflareStack> => {
  const bundled = await bundleWorker()
  const script = bundled.outputFiles?.[0]?.text
  if (script === undefined) throw new Error('The worker bundle was empty')
  const mf = new Miniflare({
    modules: true,
    script,
    durableObjects: { SYNC_HOST: 'SyncHost' },
    d1Databases: ['DB'],
    compatibilityFlags: ['streams_enable_constructors'],
    host: '127.0.0.1',
    port: 0,
  })
  const origin = (await mf.ready).origin
  const db = await mf.getD1Database('DB')
  await migrate(db)
  return { mf, origin, db, stop: () => mf.dispose() }
}

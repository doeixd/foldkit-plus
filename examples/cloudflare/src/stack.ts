/**
 * The local Cloudflare stack for the test and the demo: the example worker
 * bundled, served by miniflare over real HTTP with a Durable Object and D1.
 * Remote goes through real `fetch`, so streaming bodies behave as they do
 * deployed; only Sync upgrades ride `dispatchFetch`, which hands back the
 * client socket directly.
 */
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
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
  await db.exec(
    'CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0)',
  )
  return { mf, origin, db, stop: () => mf.dispose() }
}

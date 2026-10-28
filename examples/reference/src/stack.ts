/**
 * The local stack for the tests and `pnpm dev`: the Worker as
 * `wrangler.toml` declares it (D1, the page's assets), on a real workerd
 * over real HTTP. The page's build must be in `dist/client` first
 * (`buildPage`), since the Worker serves it and renders into its `index.html`.
 */
import { Stack } from 'foldkit-plus/testing/workers'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { configFor } from '../vite.config.js'
import { mutation } from './mutation.js'
import type { WorkerEnv } from './worker.js'

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url))

export type ReferenceStack = Stack<WorkerEnv>

const worker = {
  wrangler: here('../wrangler.toml'),
  entry: here('./worker.ts'),
  plugins: [mutation()],
}

/** Builds the page into `dist/client` as `vite build` does, under a new build id. */
export const buildPage = async (): Promise<void> => {
  await build({
    ...configFor(crypto.randomUUID()),
    root: here('..'),
    configFile: false,
    logLevel: 'error',
  })
}

export const startStack = (): Promise<ReferenceStack> => Stack.start<WorkerEnv>(worker)

/** Writes the bundle `wrangler deploy` uploads, where `main` says. */
export const writeDeployBundle = () => Stack.writeBundle(worker)

/**
 * The local Cloudflare stack for the tests, the demo and `pnpm dev`: the
 * example Worker as `wrangler.toml` declares it (D1, R2, Images, the rate
 * limiter, the Durable Object), on a real workerd over real HTTP. Remote goes
 * through real `fetch`, so streaming bodies behave as they do deployed; only
 * Sync upgrades ride `dispatch`, which hands back the client socket directly.
 */
import { Stack } from 'foldkit-plus/testing/workers'
import { fileURLToPath } from 'node:url'
import { mutation } from './mutation.js'
import type { WorkerEnv } from './worker.js'

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url))

export type CloudflareStack = Stack<WorkerEnv>

/** The upload secret the local stack runs with, new each run; a deployment sets its own. */
export const UPLOAD_TOKEN = crypto.randomUUID()

/**
 * The page origin the local stack's auth trusts (`AUTH_ORIGIN`): where
 * `pnpm dev` serves the page. A test sends it as `Origin`, as that page would.
 */
export const PAGE_ORIGIN = 'http://127.0.0.1:5177'

const worker = {
  wrangler: here('../wrangler.toml'),
  entry: here('./worker.ts'),
  plugins: [mutation()],
}

export const startStack = (): Promise<CloudflareStack> =>
  Stack.start<WorkerEnv>({
    ...worker,
    vars: { AUTH_ORIGIN: PAGE_ORIGIN },
    secrets: { UPLOAD_TOKEN },
  })

/** Writes the bundle `wrangler deploy` uploads, where `main` says. */
export const writeDeployBundle = () => Stack.writeBundle(worker)

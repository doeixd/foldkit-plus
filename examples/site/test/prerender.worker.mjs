/**
 * Renders one share of the site (`prerendered.ts`) in a thread of its own, for
 * `prerender.test.ts`. The site's modules load through a Vite server resolved
 * as Vitest resolves them, with `pnpm mutate`'s plugin, so a mutation of the
 * site reaches the pages this thread renders.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { createServer, createServerModuleRunner } from 'vite'

import { mutation } from '../../../scripts/mutation-plugin.mjs'
import { alias, inNode } from '../../../scripts/test-resolve.mjs'

const server = await createServer({
  configFile: false,
  root: import.meta.dirname,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  // Pre-bundling is for a browser; the threads would also race to write its cache.
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [mutation()],
  resolve: { conditions: inNode, alias },
  ssr: { resolve: { conditions: inNode } },
})
const runner = createServerModuleRunner(server.environments.ssr, { hmr: false })
try {
  const { share } = await runner.import('./prerendered.ts')
  parentPort?.postMessage(await share(workerData))
} finally {
  await runner.close()
  await server.close()
}

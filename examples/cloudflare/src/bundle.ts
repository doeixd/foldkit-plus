/**
 * Writes the worker bundle `wrangler deploy` uploads. Wrangler would resolve
 * the workspace packages to `dist`, which is not what the tests run; this is
 * the same bundle miniflare gets.
 */
import { fileURLToPath } from 'node:url'
import { bundleWorker } from './stack.js'

await bundleWorker(fileURLToPath(new URL('../dist/worker.js', import.meta.url)))

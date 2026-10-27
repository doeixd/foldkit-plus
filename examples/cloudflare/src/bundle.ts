/**
 * Writes the worker bundle `wrangler deploy` uploads. Wrangler would resolve
 * the workspace packages to `dist`, which is not what the tests run; this is
 * the same bundle miniflare gets.
 */
import { writeWorker } from './stack.js'

await writeWorker()

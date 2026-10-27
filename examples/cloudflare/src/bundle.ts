/**
 * Writes the worker bundle `wrangler deploy` uploads. Wrangler would resolve
 * the workspace packages to `dist`, which is not what the tests run; this is
 * the same bundle the local stack runs.
 */
import { writeDeployBundle } from './stack.js'

await writeDeployBundle()

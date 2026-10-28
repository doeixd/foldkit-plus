/**
 * Writes the Worker bundle `wrangler deploy` uploads: the same bundle the
 * local stack runs, with the workspace's source condition.
 */
import { writeDeployBundle } from './stack.js'

await writeDeployBundle()

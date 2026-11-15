/** `pnpm --filter foldkit-plus build` ends here: copies the skill and the guides beside `dist`. */
import { join } from 'node:path'

import { writeBundle } from './bundleDocs.js'

const here = join(import.meta.dirname, '..')
await writeBundle(join(here, '../..'), here)

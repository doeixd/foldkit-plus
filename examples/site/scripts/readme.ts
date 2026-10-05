/**
 * `pnpm --filter foldkit-example-site readme`: writes the root README's list of
 * demos from `src/demos.ts`, between its `<!-- demos -->` markers.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { withDemos } from '../src/readme.js'

const path = join(import.meta.dirname, '../../../README.md')
writeFileSync(path, withDemos(readFileSync(path, 'utf8')))

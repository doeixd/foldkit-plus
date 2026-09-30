/** The fixture site's directory, for tests that build or read it. */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixture-site')

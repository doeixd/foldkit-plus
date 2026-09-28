import { Effect } from 'effect'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { generatePages } from '../src/entry.server.js'

/** The example's own `index.html`, which the build renders each page into. */
export const template = readFileSync(join(import.meta.dirname, '../index.html'), 'utf8')

/** The template loading `src` as its entry script, as Vite's build rewrites it. */
export const loading = (src: string): string => template.replace('/src/entry.ts', src)

export const generate = (from: string = template) => Effect.runPromise(generatePages(from))

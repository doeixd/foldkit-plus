import { Effect } from 'effect'
import { generateStaticSite, type BuiltSite } from 'foldkit-ssr/vite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { site } from '../src/site.js'

/** The example's own `index.html`, which the build renders each page into. */
export const template = readFileSync(join(import.meta.dirname, '../index.html'), 'utf8')

/**
 * The site the build produces, through the same path `vite build` runs:
 * `generateStaticSite` renders every path in `site` as build `buildId` saw it.
 */
export const generate = (from: string, buildId: string): Promise<BuiltSite> =>
  Effect.runPromise(generateStaticSite({ ...site, buildId, template: from }))

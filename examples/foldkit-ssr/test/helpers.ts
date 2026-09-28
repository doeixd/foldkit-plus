import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildIdOf, makePageHandler } from '../src/entry.server.js'

/** The example's own `index.html`, which each page is rendered into. */
export const template = readFileSync(join(import.meta.dirname, '../index.html'), 'utf8')

/** The template loading `src` as its entry script, as Vite's build rewrites it. */
export const loading = (src: string): string => template.replace('/src/entry.ts', src)

/** A request for `/` as a browser sends one, with `cookie` if given. */
export const pageRequest = (init: { readonly method?: string; readonly cookie?: string } = {}) =>
  new Request('http://localhost/', {
    method: init.method ?? 'GET',
    headers: { accept: 'text/html', ...(init.cookie === undefined ? {} : { cookie: init.cookie }) },
  })

/** The response to `request`, rendered in process from `from`. */
export const respond = (request: Request, from: string = template): Promise<Response> =>
  makePageHandler({ template: from, buildId: buildIdOf(from) })(request)

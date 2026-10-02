import { handleRequest } from 'foldkit/experimental/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { makeRenderPage } from '../src/renderPage.js'

/** The example's own `index.html`, which the host renders each page into. */
export const template = readFileSync(join(import.meta.dirname, '../index.html'), 'utf8')

/** The deployment the pages are rendered as: what the plugin compiles in. */
export const buildId = 'test-build'

/** A request for `/` as a browser sends one, with `cookie` if given. */
export const pageRequest = (init: { readonly method?: string; readonly cookie?: string } = {}) =>
  new Request('http://localhost/', {
    method: init.method ?? 'GET',
    headers: { accept: 'text/html', ...(init.cookie === undefined ? {} : { cookie: init.cookie }) },
  })

/** The response to `request`, rendered in process through the real entry. */
export const respond = (request: Request): Promise<Response> =>
  handleRequest(request, { renderPage: makeRenderPage(buildId), template })

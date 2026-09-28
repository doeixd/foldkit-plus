/**
 * The server's half of the example: every page request rendered from the
 * visitor's cookie by `foldkit-ssr`, with its styles in the head. `serve.ts`
 * hosts it; `entry.ts` takes the page over in the browser.
 */
import { handleRequest } from 'foldkit/experimental/server'
import { Style } from 'foldkit-mixins'
import { SSR } from 'foldkit-ssr'

import { readCountCookie } from './cookie.js'
import { Flags, Model, init, plan, update, view } from './main.js'
import { stylesheet } from './style.js'

const flagsForRequest = (cookieHeader: string): Flags => ({
  initialCount: readCountCookie(cookieHeader),
  renderedAt: new Date().toISOString(),
  renderedOn: 'Server',
})

// NOTE: the Flags built from this request shape the server's `init` and stay
// on the server. The page carries the Model `init` reached (the plan's state),
// which the browser starts from without running `init` at all.

/**
 * Each page is one visitor's count, so no cache may keep it or share it.
 *
 * NOTE: a preflight reaches the entry in development and in production alike,
 * which answers it with the methods it takes, and these headers are where an
 * application's CORS policy goes: they see the request, so they can allow one
 * origin for one route and refuse it for another, which no host-level setting
 * could express. This example allows nothing.
 */
const pageHeaders = {
  'cache-control': 'private, no-store',
  vary: 'cookie',
  'x-content-type-options': 'nosniff',
}

/**
 * The build a page belongs to: the address of the entry script the template
 * loads, which `entry.ts` reads of itself as `import.meta.url`. A page from
 * another build is refused before the browser adopts it. Read it from the
 * template as written, before Vite's development server adds its own client.
 */
export const buildIdOf = (template: string): string => {
  const entry = template.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1]
  if (entry === undefined) throw new Error('index.html loads no module script')
  return new URL(entry, 'http://localhost').pathname
}

/**
 * The foundations and the classes the page draws, so the first paint is
 * styled before any script runs. The browser's Styles find these classes
 * present and add none of them again.
 */
const head = (rendered: { readonly html: string }): string =>
  `<style>${stylesheet}</style><style>${Style.usedIn(rendered.html)}</style>`

/**
 * A Web `fetch` handler for the page requests no static file answered, through
 * Foldkit's `handleRequest` into `foldkit-ssr`'s entry, which renders `GET` and
 * `HEAD`, answers `OPTIONS`, and refuses the other methods with `405`.
 */
export const makePageHandler = (options: {
  readonly template: string
  readonly buildId: string
}): ((request: Request) => Promise<Response>) => {
  const { renderPage } = SSR.entry({ Model, Flags, init, update, view, container: null }, plan, {
    buildId: options.buildId,
    template: options.template,
    head,
    headers: () => pageHeaders,
    flags: request => flagsForRequest(request.headers.get('cookie') ?? ''),
  })
  return request => handleRequest(request, { renderPage, template: options.template })
}

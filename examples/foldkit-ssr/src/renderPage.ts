/**
 * How a page request is answered: the application's Flags read from the
 * visitor's cookie, the headers on every answer, and the `renderPage`
 * Foldkit's pipeline calls. Loaded by the dev server and the production host
 * alike; only the build id differs, which the caller passes.
 */
import { SSR } from 'foldkit-ssr'
import type { EntryResult } from 'foldkit/experimental/server'

import { readCountCookie } from './cookie.js'
import { Flags, Model, init, plan, update, view } from './main.js'

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
 * The `renderPage` Foldkit's pipeline calls for the page requests no static
 * file answered: through `handleRequest` into `foldkit-ssr`'s entry, which
 * renders `GET` and `HEAD`, answers `OPTIONS`, and refuses the other methods
 * with `405`.
 */
export const makeRenderPage = (buildId: string): ((request: Request) => Promise<EntryResult>) =>
  SSR.entry({ Model, Flags, init, update, view, container: null }, plan, {
    buildId,
    headers: () => pageHeaders,
    flags: request => flagsForRequest(request.headers.get('cookie') ?? ''),
  }).renderPage

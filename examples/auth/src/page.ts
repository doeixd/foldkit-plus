/**
 * How a page request is answered, on the server: read as the request's
 * principal, then sent away (`303`) or rendered. Loaded by Vite's dev server
 * through `entry.server.ts` and by the tests alike; the caller names the
 * build and the auth server.
 */
import { Effect, Exit, Option } from 'effect'
import { Responded, type EntryResult } from 'foldkit/experimental/server'
import { fromString } from 'foldkit/url'
import { Remote } from 'foldkit-remote'
import { Access } from 'foldkit-site'
import { SSR } from 'foldkit-ssr'
import { Data, Model, accessOf, actives, initial, plan, unreadAt, update } from './app.js'
import { view } from './view.js'

/** Each page is one reader's, and so is each redirect: no cache may keep or share either. */
const pageHeaders = { 'cache-control': 'private, no-store', vary: 'cookie' }

/**
 * The Model of the page at `request`'s address, with everything it shows
 * read from the auth server as whoever the request's cookie says: the
 * cookie, the page's origin and Yielded's CSRF header, as the page's own
 * reads carry them. A cookie the server no longer holds reads nothing, and
 * the page is drawn unread: the browser reads again and is told why.
 */
const readAs = (request: Request, authServer: string) => {
  const url = Option.getOrThrowWith(
    fromString(request.url),
    () => new Error(`examples/auth: ${request.url} is not a URL`),
  )
  const cookie = request.headers.get('cookie')
  const transport = Remote.http(`${authServer}/remote`, {
    headers: () => ({
      origin: new URL(request.url).origin,
      'x-effect-auth-csrf': '1',
      ...(cookie === null ? {} : { cookie }),
    }),
  })
  const unread = unreadAt(url)
  return Data.satisfy(unread, actives).pipe(
    Effect.catchTag('Unauthenticated', () => Effect.succeed(unread)),
    Effect.provide(Remote.clientLayer(transport)),
  )
}

/**
 * The `renderPage` the dev server calls. `GET` and `HEAD` are read as the
 * request's principal first: a page `accessOf` refuses is a `303` to where it
 * sends the reader, and SSR's entry never runs. A page it allows is rendered
 * from what was read, so the decision and the page come from one read. Any
 * other method goes to the entry, which answers it without a read.
 */
export const makeRenderPage = (options: {
  readonly buildId: string
  readonly authServer: string
}): ((request: Request) => Promise<EntryResult>) => {
  // One entry per page: it starts from the Model this request read, which the
  // 303 was decided on, so the page is never read a second time for `flags`.
  const entryFor = (model: Model) =>
    SSR.entry({ Model, init: () => ({ model }), update, view, container: null }, plan, {
      buildId: options.buildId,
      headers: () => pageHeaders,
    })
  return async request => {
    const method = request.method.toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') return entryFor(initial).renderPage(request)
    return Exit.match(await Effect.runPromiseExit(readAs(request, options.authServer)), {
      onFailure: async cause => {
        console.error(`examples/auth: ${request.url} could not be read`, cause)
        return Responded(new Response('The page could not be read.', { status: 500 }))
      },
      onSuccess: model =>
        Access.match(accessOf(model), {
          Denied: async ({ url }) =>
            Responded(
              new Response(null, { status: 303, headers: { location: url, ...pageHeaders } }),
            ),
          Allowed: () => entryFor(model).renderPage(request),
          // `Me` went unread (a session that ended): the browser decides once it reads it.
          Pending: () => entryFor(model).renderPage(request),
        }),
    })
  }
}

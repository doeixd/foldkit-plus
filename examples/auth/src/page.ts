/**
 * How a page request is answered, on the server: read as the request's
 * principal, then sent away (`303`) or rendered. The host hands each page
 * the reader its reads go through (`PageContext`): `host.ts` one in this
 * process, Vite's dev server one over HTTP (`entry.server.ts`). The caller
 * names the build.
 */
import { Effect, Exit, Layer, Option } from 'effect'
import { Responded, type EntryResult } from 'foldkit/experimental/server'
import { fromString } from 'foldkit/url'
import { Remote, type RemoteClient, type RemoteUnauthenticated } from 'foldkit-remote'
import { Access } from 'foldkit-site'
import { SSR } from 'foldkit-ssr'
import { Data, Model, accessOf, actives, initial, plan, unreadAt, update } from './app.js'
import { view } from './view.js'

/** What the host hands each page request: the reader its reads go through, as whoever asked. */
export const PageContext = SSR.requestContext<{
  readonly reader: Layer.Layer<RemoteClient, RemoteUnauthenticated>
}>('foldkit-example-auth/page')

/**
 * A page's reader in another process than the auth server, as Vite's dev
 * server is: Remote over HTTP with the request's cookie, the page's origin
 * and Yielded's CSRF header, as the page's own reads carry them.
 */
export const httpReader = (
  request: Request,
  authServer: string,
): Layer.Layer<RemoteClient, RemoteUnauthenticated> => {
  const cookie = request.headers.get('cookie')
  return Remote.clientLayer(
    Remote.http(`${authServer}/remote`, {
      headers: () => ({
        origin: new URL(request.url).origin,
        'x-effect-auth-csrf': '1',
        ...(cookie === null ? {} : { cookie }),
      }),
    }),
  )
}

/** Each page is one reader's, and so is each redirect: no cache may keep or share either. */
const pageHeaders = { 'cache-control': 'private, no-store', vary: 'cookie' }

/**
 * The Model of the page at `request`'s address, with everything it shows
 * read through `reader`, as whoever the request's cookie says. A cookie the
 * server no longer holds reads nothing, and the page is drawn unread: the
 * browser reads again and is told why.
 */
const readAs = (request: Request, reader: Layer.Layer<RemoteClient, RemoteUnauthenticated>) => {
  const url = Option.getOrThrowWith(
    fromString(request.url),
    () => new Error(`examples/auth: ${request.url} is not a URL`),
  )
  const unread = unreadAt(url)
  return Data.satisfy(unread, actives).pipe(
    Effect.provide(reader),
    Effect.catchTag('Unauthenticated', () => Effect.succeed(unread)),
  )
}

/**
 * The `renderPage` the host calls. `GET` and `HEAD` are read as the
 * request's principal first, through the reader the host attached: a page
 * `accessOf` refuses is a `303` to where it sends the reader, and SSR's entry
 * never runs. A page it allows is rendered from what was read, so the
 * decision and the page come from one read. A request with no reader is a
 * 500 that says why. Any other method goes to the entry, which answers it
 * without a read.
 */
export const makeRenderPage = (options: {
  readonly buildId: string
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
    const context = PageContext.of(request)
    if (Option.isNone(context)) {
      console.error(
        `examples/auth: ${request.url} reached renderPage without a reader: the host attaches one with PageContext`,
      )
      return Responded(new Response('The page could not be read.', { status: 500 }))
    }
    return Exit.match(await Effect.runPromiseExit(readAs(request, context.value.reader)), {
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

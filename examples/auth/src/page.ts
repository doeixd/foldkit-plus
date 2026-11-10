/**
 * How a page request is answered, on the server: read as the request's
 * principal, then sent away (`303`) or rendered, by one entry. The host hands each page
 * the reader its reads go through (`PageContext`): `host.ts` one in this
 * process, Vite's dev server one over HTTP (`entry.server.ts`). The caller
 * names the build.
 */
import { Effect, Layer, Option } from 'effect'
import type { EntryResult } from 'foldkit/experimental/server'
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
 * read through the reader the host attached, as whoever the request's cookie
 * says. A cookie the server no longer holds reads nothing, and the page is
 * drawn unread: the browser reads again and is told why. A request with no
 * reader fails, which the entry answers 500.
 */
const readAs = (request: Request) =>
  Option.match(PageContext.of(request), {
    onNone: () =>
      Effect.die(
        new Error(
          `${request.url} reached renderPage without a reader: the host attaches one with PageContext`,
        ),
      ),
    onSome: ({ reader }) => {
      const unread = unreadAt(
        Option.getOrThrowWith(
          fromString(request.url),
          () => new Error(`examples/auth: ${request.url} is not a URL`),
        ),
      )
      return Data.satisfy(unread, actives).pipe(
        Effect.provide(reader),
        Effect.catchTag('Unauthenticated', () => Effect.succeed(unread)),
      )
    },
  })

/**
 * The `renderPage` the host calls. `GET` and `HEAD` are read as the
 * request's principal first: a page `accessOf` refuses is a `303` to where it
 * sends the reader, and is never rendered. One it allows, or one whose reader
 * went unread (`Pending`: the browser decides once it reads it), is rendered
 * from what was read, so the decision and the page come from one read. Any
 * other method is answered by the entry without a read.
 */
export const makeRenderPage = (options: {
  readonly buildId: string
}): ((request: Request) => Promise<EntryResult>) =>
  SSR.entry({ Model, init: () => ({ model: initial }), update, view, container: null }, plan, {
    buildId: options.buildId,
    prepare: (_model, request) => readAs(request),
    redirect: model =>
      Access.match(accessOf(model), {
        Denied: ({ url }) => Option.some(url),
        Allowed: () => Option.none(),
        Pending: () => Option.none(),
      }),
    headers: () => pageHeaders,
    diagnostics: diagnostic =>
      Effect.sync(() => console.error(`examples/auth: ${diagnostic.message}`)),
  }).renderPage

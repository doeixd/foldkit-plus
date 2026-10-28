/**
 * How the Worker answers a page: read as the request's reader, then sent on
 * (`303`) or rendered. The Worker hands each page the reader its reads go
 * through (`PageContext`), made in its own process from the same config
 * `/remote` answers with, so a render reads as the reader with no HTTP to
 * itself.
 */
import { Effect, Exit, Layer, Option } from 'effect'
import { Responded, type EntryResult } from 'foldkit/experimental/server'
import { fromString } from 'foldkit/url'
import { Style } from 'foldkit-plus/mixins'
import type { RemoteClient, RemoteUnauthenticated } from 'foldkit-plus/remote'
import { Access } from 'foldkit-plus/site'
import { SSR } from 'foldkit-plus/ssr'
import { Data, Model, accessOf, actives, initial, plan, unreadAt, update } from './main.js'
import { view } from './view.js'

/** What the Worker hands each page request: the reader its reads go through, as whoever asked. */
export const PageContext = SSR.requestContext<{
  readonly reader: Layer.Layer<RemoteClient, RemoteUnauthenticated>
}>('foldkit-example-reference/page')

/** Each page is one reader's, and so is each redirect: no cache may keep or share either. */
const pageHeaders = { 'cache-control': 'private, no-store', vary: 'cookie' }

/**
 * The classes the page draws, so its first paint is styled before any
 * script runs. The theme itself is in the template (`foundations` writes it
 * into `index.html`).
 */
const styles = (rendered: { readonly html: string }): string =>
  `<style>${Style.usedIn(rendered.html)}</style>`

/**
 * The Model of the page at `request`'s address, with everything it shows
 * read as whoever the cookie says. A cookie the server no longer holds reads
 * nothing, and the page is drawn unread: the browser reads again and is told why.
 */
const readAs = (request: Request, reader: Layer.Layer<RemoteClient, RemoteUnauthenticated>) => {
  const url = Option.getOrThrowWith(
    fromString(request.url),
    () => new Error(`${request.url} is not a URL`),
  )
  const unread = unreadAt(url)
  return Data.satisfy(unread, actives).pipe(
    Effect.provide(reader),
    Effect.catchTag('Unauthenticated', () => Effect.succeed(unread)),
  )
}

const failed = (reason: string, cause?: unknown) => {
  console.error(`foldkit-example-reference: ${reason}`, ...(cause === undefined ? [] : [cause]))
  return Responded(new Response('The page could not be read.', { status: 500 }))
}

/**
 * The `renderPage` the Worker calls, for the build `buildId` names. `GET`
 * and `HEAD` are read as the request's reader first: a page `accessOf`
 * refuses is a `303` to where it sends them, and the render never runs. One
 * it allows is rendered from what was read, so the decision and the page
 * come from one read. Any other method goes to the entry, which refuses it.
 */
export const makeRenderPage = (buildId: string): ((request: Request) => Promise<EntryResult>) => {
  const entryFor = (model: Model) =>
    SSR.entry({ Model, init: () => ({ model }), update, view, container: null }, plan, {
      buildId,
      headers: () => pageHeaders,
      styles,
    })
  return async request => {
    const method = request.method.toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') return entryFor(initial).renderPage(request)
    const context = PageContext.of(request)
    if (Option.isNone(context))
      return failed(
        `${request.url} reached renderPage without a reader: attach one with PageContext`,
      )
    return Exit.match(await Effect.runPromiseExit(readAs(request, context.value.reader)), {
      onFailure: async cause => failed(`${request.url} could not be read`, cause),
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

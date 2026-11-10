/**
 * How the Worker answers a page: read as the request's reader, then sent on
 * (`303`) or rendered, by one entry. The Worker hands each page the reader its
 * reads go through (`PageContext`), made in its own process from the same
 * config `/remote` answers with, so a render reads as the reader with no HTTP
 * to itself.
 */
import { Effect, Layer, Option } from 'effect'
import type { EntryResult } from 'foldkit/experimental/server'
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
const styles = (_rendered: { readonly html: string }, drawn: ReadonlySet<string>): string =>
  `<style>${Style.usedDrawn(drawn)}</style>`

/**
 * The Model of the page at `request`'s address, with everything it shows
 * read as whoever the cookie says. A cookie the server no longer holds reads
 * nothing, and the page is drawn unread: the browser reads again and is told why.
 */
const readAs = (request: Request) =>
  Option.match(PageContext.of(request), {
    onNone: () =>
      Effect.die(
        new Error(
          `${request.url} reached renderPage without a reader: attach one with PageContext`,
        ),
      ),
    onSome: ({ reader }) => {
      const unread = unreadAt(
        Option.getOrThrowWith(
          fromString(request.url),
          () => new Error(`${request.url} is not a URL`),
        ),
      )
      return Data.satisfy(unread, actives).pipe(
        Effect.provide(reader),
        Effect.catchTag('Unauthenticated', () => Effect.succeed(unread)),
      )
    },
  })

/**
 * The entry the Worker calls, for the build `buildId` names. `GET` and `HEAD`
 * are read as the request's reader first: a page `accessOf` refuses is a `303`
 * to where it sends them, and is never rendered. One it allows, or one whose
 * reader went unread (`Pending`: the browser decides once it reads it), is
 * rendered from what was read, so the decision and the page come from one read.
 */
export const makeRenderPage = (buildId: string): ((request: Request) => Promise<EntryResult>) =>
  SSR.entry({ Model, init: () => ({ model: initial }), update, view, container: null }, plan, {
    buildId,
    prepare: (_model, request) => readAs(request),
    redirect: model =>
      Access.match(accessOf(model), {
        Denied: ({ url }) => Option.some(url),
        Allowed: () => Option.none(),
        Pending: () => Option.none(),
      }),
    headers: () => pageHeaders,
    styles,
    diagnostics: diagnostic =>
      Effect.sync(() => console.error(`foldkit-example-reference: ${diagnostic.message}`)),
  }).renderPage

/**
 * The Worker's entry, and the dev server's: `/remote` answers the prices
 * (`remote.ts`), and every other path is a page rendered by `foldkit-ssr`,
 * which carries the Model the server reached for the browser to resume
 * from (`client/entry.ts`).
 */
import { Effect, Option } from 'effect'
import {
  Rendered,
  Responded,
  renderDocument as renderShell,
  type DocumentRenderer,
  type EntryResult,
} from 'foldkit/experimental/server'
import { type Url, fromString } from 'foldkit/url'
import { Style } from 'foldkit-mixins'
import { SSR } from 'foldkit-ssr'
import {
  Data,
  Model,
  actives,
  initWith,
  plan,
  routing,
  subscriptions,
  update,
} from '../client/app.js'
import { documentHead } from '../client/documentHead.js'
import { AppRoute } from '../client/site.js'
import { stylesheet } from '../client/style.js'
import { view } from '../client/view.js'
import { cartCookie, cartOf, hasCart } from './cart.js'
import { readPrices, serveRemote } from './remote.js'

/** The document around a rendered page: the head every page carries. */
export const renderDocument: DocumentRenderer = (application, assets) =>
  renderShell(application, assets, { head: documentHead })

/**
 * The page at the request's address, holding the cart its cookie keeps,
 * with every price it shows read in this process, so it is whole before
 * any script runs. A read that fails leaves the page unread, and the
 * browser reads it as it would have.
 */
const readPage = (request: Request, url: Url): Promise<Model> => {
  const opened = initWith(url, cartOf(request)).model
  return Effect.runPromise(
    Data.satisfy(opened, actives).pipe(
      Effect.provide(readPrices(request)),
      Effect.catchCause(cause =>
        Effect.as(Effect.logError('domains-plus: the page could not be read first', cause), opened),
      ),
    ),
  )
}

/**
 * The page for one request, from the Model it read: one entry per page
 * (#393). A
 * cart form posted without scripts reaches `SSR.handle` through it, which
 * runs `update` and renders the result, and the cart that post reached is
 * kept in the cookie the next request reads. The entry hands no Model to
 * `headers`, so the one `status` is given is kept to write it (#389).
 */
const answer = async (request: Request, url: Url): Promise<EntryResult> => {
  const model = await readPage(request, url)
  let reached = Option.none<Model>()
  const result = await SSR.entry(
    { Model, init: () => ({ model }), update, view, subscriptions, routing, container: null },
    plan,
    {
      buildId: import.meta.env.FOLDKIT_BUILD_ID,
      // A form may be posted from this page's own origin, and no other.
      origins: [new URL(request.url).origin],
      // A page drawn with a visitor's cart is theirs alone.
      ...(hasCart(request) ? { headers: () => ({ 'cache-control': 'private, no-store' }) } : {}),
      // The theme and the classes the page draws, so the first paint is styled
      // before any script runs; the browser moves them into the head, and its
      // Styles find them there and add none twice.
      styles: rendered =>
        `<style>${stylesheet}</style><style>${Style.usedIn(rendered.html)}</style>`,
      status: model => {
        reached = Option.some(model)
        return AppRoute.match(model.route, { Search: () => 200, NotFound: () => 404 })
      },
    },
  ).renderPage(request)
  if (request.method.toUpperCase() !== 'POST' || result._tag !== 'Rendered') return result
  return Option.match(reached, {
    onNone: () => result,
    onSome: ({ cart }) =>
      Rendered(result.application, {
        ...(result.status === undefined ? {} : { status: result.status }),
        headers: {
          'cache-control': 'private, no-store',
          'set-cookie': cartCookie(cart, request.url.startsWith('https:')),
        },
      }),
  })
}

/** `/remote` answers the prices; every other path is a page. */
export const renderPage = async (request: Request): Promise<EntryResult> =>
  Option.match(fromString(request.url), {
    onNone: async () => Responded(new Response('Not a URL.', { status: 400 })),
    onSome: async url =>
      url.pathname === '/remote'
        ? Responded(await serveRemote(request, undefined))
        : answer(request, url),
  })

/**
 * The Worker's entry, and the dev server's: `/remote` answers the prices
 * (`remote.ts`), and every other path is a page rendered by `foldkit-ssr`,
 * which carries the Model the server reached for the browser to resume
 * from (`client/entry.ts`).
 */
import { Effect, Option } from 'effect'
import {
  Responded,
  renderDocument as renderShell,
  type DocumentRenderer,
  type EntryResult,
} from 'foldkit/experimental/server'
import { href } from 'virtual:foldkit-styles'
import { modifyFields } from 'foldkit/struct'
import { fromString } from 'foldkit/url'
import { SSR } from 'foldkit-ssr'
import {
  CartInCookie,
  Data,
  Model,
  actives,
  init,
  plan,
  routing,
  subscriptions,
  update,
} from '../client/app.js'
import { documentHead } from '../client/documentHead.js'
import { AppRoute } from '../client/site.js'
import { view } from '../client/view.js'
import { cartOf, hasCart } from './cart.js'
import { readPrices, serveRemote } from './remote.js'

/**
 * The head every page carries, and the application's stylesheet linked in it:
 * a file the browser caches, in the head so the first paint waits for it, and
 * one the server does not write or have Foldkit parse again with every page.
 * The mark tells the browser's Styles the classes in it are drawn.
 */
const head = `${documentHead}
<link rel="stylesheet" href="${href}" data-foldkit-styles-href>`

/** The document around a rendered page. */
export const renderDocument: DocumentRenderer = (application, assets) =>
  renderShell(application, assets, { head })

/**
 * The page at the request's address, holding the cart its cookie keeps,
 * with every price it shows read in this process, so it is whole before
 * any script runs. A read that fails leaves the page unread, and the
 * browser reads it as it would have.
 */
const readPage = (model: Model, request: Request): Effect.Effect<Model> => {
  const opened = modifyFields(model, { cart: () => cartOf(request) })
  return Data.satisfy(opened, actives).pipe(
    Effect.provide(readPrices(request)),
    Effect.catchCause(cause =>
      Effect.as(Effect.logError('domains-plus: the page could not be read first', cause), opened),
    ),
  )
}

/**
 * Every page, and every cart form posted without scripts, which `SSR.handle`
 * answers by running `update` on the page it was posted from. The cart that
 * post reached is kept in the cookie the next request reads, and the post is
 * answered with a redirect to its page, so a reload asks for the page again
 * and posts nothing.
 */
const pages = SSR.entry(
  { Model, init, update, view, subscriptions, routing, container: null },
  plan,
  {
    buildId: import.meta.env.FOLDKIT_BUILD_ID,
    // A form may be posted from this page's own origin, and no other.
    origins: 'same-origin',
    prepare: readPage,
    answerPost: 'redirect',
    headers: (request, reached) => ({
      // A page drawn with a visitor's cart is theirs alone.
      ...(hasCart(request) || request.method === 'POST'
        ? { 'cache-control': 'private, no-store' }
        : {}),
      ...Option.match(reached, {
        onNone: () => ({}),
        onSome: model =>
          request.method === 'POST'
            ? Option.match(CartInCookie.setCookie(model, request), {
                onNone: () => ({}),
                onSome: cookie => ({ 'set-cookie': cookie }),
              })
            : {},
      }),
    }),
    status: model => AppRoute.match(model.route, { Search: () => 200, NotFound: () => 404 }),
  },
)

/** `/remote` answers the prices; every other path is a page. */
export const renderPage = async (request: Request): Promise<EntryResult> =>
  Option.match(fromString(request.url), {
    onNone: async () => Responded(new Response('Not a URL.', { status: 400 })),
    onSome: async url =>
      url.pathname === '/remote'
        ? Responded(await serveRemote(request, undefined))
        : pages.renderPage(request),
  })

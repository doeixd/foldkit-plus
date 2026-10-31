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
import { fromString } from 'foldkit/url'
import { Style } from 'foldkit-mixins'
import { SSR } from 'foldkit-ssr'
import { Data, Model, actives, init, plan, routing, subscriptions, update } from '../client/app.js'
import { documentHead } from '../client/documentHead.js'
import { AppRoute } from '../client/site.js'
import { stylesheet } from '../client/style.js'
import { view } from '../client/view.js'
import { readPrices, serveRemote } from './remote.js'

/** The document around a rendered page: the head every page carries. */
export const renderDocument: DocumentRenderer = (application, assets) =>
  renderShell(application, assets, { head: documentHead })

/**
 * The page at the request's address with every price it shows read, in
 * this process, so it is whole before any script runs. A read that fails
 * leaves the page unread, and the browser reads it as it would have.
 */
const readPage = (request: Request, url: Parameters<typeof init>[0]): Promise<Model> => {
  const opened = init(url).model
  return Effect.runPromise(
    Data.satisfy(opened, actives).pipe(
      Effect.provide(readPrices(request)),
      Effect.catchCause(cause =>
        Effect.as(Effect.logError('domains-plus: the page could not be read first', cause), opened),
      ),
    ),
  )
}

/** One entry per page: it starts from the Model this request read. */
const pageFrom = (model: Model) =>
  SSR.entry(
    { Model, init: () => ({ model }), update, view, subscriptions, routing, container: null },
    plan,
    {
      buildId: import.meta.env.FOLDKIT_BUILD_ID,
      // The theme and the classes the page draws, so the first paint is styled
      // before any script runs; the browser moves them into the head, and its
      // Styles find them there and add none twice.
      styles: rendered =>
        `<style>${stylesheet}</style><style>${Style.usedIn(rendered.html)}</style>`,
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
        : pageFrom(await readPage(request, url)).renderPage(request),
  })

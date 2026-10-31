/**
 * The Worker's entry, and the dev server's: `/remote` answers the prices
 * (`remote.ts`), and every other path is a page rendered by `foldkit-ssr`,
 * which carries the Model the server reached for the browser to resume
 * from (`client/entry.ts`).
 */
import { Option } from 'effect'
import {
  Responded,
  renderDocument as renderShell,
  type DocumentRenderer,
  type EntryResult,
} from 'foldkit/experimental/server'
import { fromString } from 'foldkit/url'
import { Style } from 'foldkit-mixins'
import { SSR } from 'foldkit-ssr'
import { Model, init, plan, routing, subscriptions, update } from '../client/app.js'
import { documentHead } from '../client/documentHead.js'
import { AppRoute } from '../client/site.js'
import { stylesheet } from '../client/style.js'
import { view } from '../client/view.js'
import { serveRemote } from './remote.js'

/** The document around a rendered page: the head every page carries. */
export const renderDocument: DocumentRenderer = (application, assets) =>
  renderShell(application, assets, { head: documentHead })

/** The pages a build writes as files: the plugin reads it, and so does `SSR.entry`. */
export const prerenderPaths: ReadonlyArray<string> = ['/']

const pages = SSR.entry(
  { Model, init, update, view, subscriptions, routing, container: null },
  plan,
  {
    buildId: import.meta.env.FOLDKIT_BUILD_ID,
    // The theme and the classes the page draws, so the first paint is styled
    // before any script runs; the browser moves them into the head, and its
    // Styles find them there and add none twice.
    styles: rendered => `<style>${stylesheet}</style><style>${Style.usedIn(rendered.html)}</style>`,
    prerendered: prerenderPaths,
    status: model => AppRoute.match(model.route, { Search: () => 200, NotFound: () => 404 }),
  },
)

/** `/remote` answers the prices; every other path is a page. */
export const renderPage = async (request: Request): Promise<EntryResult> =>
  Option.exists(fromString(request.url), ({ pathname }) => pathname === '/remote')
    ? Responded(await serveRemote(request, undefined))
    : pages.renderPage(request)

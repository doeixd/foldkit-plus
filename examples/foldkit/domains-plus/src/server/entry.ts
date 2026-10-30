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
import { AppRoute, routeOf } from '../client/site.js'
import { stylesheet } from '../client/style.js'
import { view } from '../client/view.js'
import { serveRemote } from './remote.js'

/**
 * The document around a rendered page. Its head carries the theme and the
 * classes the page draws, so the first paint is styled before any script
 * runs, and the browser's Styles find them there and add none twice. They
 * are in the head rather than in the rendered root (`SSR.entry`'s `styles`),
 * since hydration drops the root's and a page with no render after its
 * first would never add them back (#365).
 */
export const renderDocument: DocumentRenderer = (application, assets) =>
  renderShell(application, assets, {
    head: `${documentHead}
<style>${stylesheet}</style><style>${Style.usedIn(application.html)}</style>`,
  })

const pages = SSR.entry(
  { Model, init, update, view, subscriptions, routing, container: null },
  plan,
  { buildId: import.meta.env.FOLDKIT_BUILD_ID },
)

/**
 * A page, answered 404 where the route is NotFound. `SSR.entry` answers every
 * page it renders 200 (#364), so the status is set on its result.
 */
export const renderPage = async (request: Request): Promise<EntryResult> => {
  const url = fromString(request.url)
  if (Option.exists(url, ({ pathname }) => pathname === '/remote'))
    return Responded(await serveRemote(request, undefined))
  const result = await pages.renderPage(request)
  const missing = Option.exists(url, at => AppRoute.guards.NotFound(routeOf(at)))
  return result._tag === 'Rendered' && missing ? { ...result, status: 404 } : result
}

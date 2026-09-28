/**
 * The site's runtime config: what the browser runs, and what the build renders
 * each page with (`prerender.ts`), so the two cannot draw different pages.
 */
import type { Layer } from 'effect'
import type { RemoteClient } from 'foldkit-remote'
import type { UrlRequest } from 'foldkit/navigation'
import type { Url } from 'foldkit/url'
import * as Site from '../apps/siteApp.js'
import type { Chair } from '../server/transport.js'
import { view } from '../views/siteView.js'

export const siteConfig = <Container extends HTMLElement | null>(options: {
  readonly init: (url: Url) => ReturnType<typeof Site.initial>
  readonly resources: Layer.Layer<RemoteClient>
  /** The page's element in the browser; none where the build renders. */
  readonly container: Container
}) =>
  Site.placements.complete({
    Model: Site.Model,
    container: options.container,
    init: options.init,
    update: Site.update,
    view,
    routing: {
      onUrlChange: (url: Url) => Site.Message.UrlChanged({ url }),
      onUrlRequest: (request: UrlRequest) => Site.Message.UrlRequested({ request }),
    },
    subscriptions: Site.placements.subscriptions(),
    resources: options.resources,
  })

/**
 * Whether the browser takes a page the build rendered over as it is. That page
 * shows the seed to a visitor, so only while the sandbox still holds the seed
 * and the page is read as a visitor; otherwise the site draws afresh in its
 * place, from the visitor's own sandbox and with their chair's links.
 */
export const takesOver = (page: ParentNode, reader: Chair, edited: boolean): boolean =>
  page.querySelector('script[data-foldkit-plus-resume]') !== null && reader === 'visitor' && !edited

/**
 * Foldkit's mark on a rendered application's root (`FOLDKIT_APP_ATTRIBUTE`).
 * Written out: Foldkit exports it only from `foldkit/experimental/server`,
 * whose import put the server's renderer in every page's bundle.
 */
export const APP_ROOT = 'data-foldkit-app'

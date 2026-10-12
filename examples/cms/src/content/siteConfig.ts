/**
 * The site's runtime config: what the browser runs, and what the build renders
 * each page with (`prerender.ts`), so the two cannot draw different pages.
 */
import { Option, Stream, type Layer } from 'effect'
import * as Subscription from 'foldkit/subscription'
import { keepScroll } from 'foldkit-primitives/dom'
import type { RemoteClient } from 'foldkit-remote'
import { FOLDKIT_APP_ATTRIBUTE } from 'foldkit-ssr/client'
import type { UrlRequest } from 'foldkit/navigation'
import { fromString, toString as urlToString, type Url } from 'foldkit/url'
import * as Site from '../apps/siteApp.js'
import type { Chair } from '../server/transport.js'
import { view } from '../views/siteView.js'

/**
 * The address of the link a reader points at or tabs to, on this page's own
 * origin: where they may go next. Each link once while they stay on it, since
 * crossing its text sends one event per element inside it.
 */
const pointedLinks = (): Stream.Stream<Url> => {
  if (typeof document === 'undefined') return Stream.empty
  const linkOf = (event: Event): Option.Option<Url> => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null
    return link instanceof HTMLAnchorElement && link.origin === window.location.origin
      ? fromString(link.href)
      : Option.none()
  }
  return Stream.merge(
    Subscription.fromEventFilterMap({
      target: document,
      type: 'pointerover',
      filterMapEvent: linkOf,
    }),
    Subscription.fromEventFilterMap({ target: document, type: 'focusin', filterMapEvent: linkOf }),
  ).pipe(Stream.changesWith((a, b) => urlToString(a) === urlToString(b)))
}

export const siteConfig = <Container extends HTMLElement | null>(options: {
  readonly initial: (url: Url) => ReturnType<typeof Site.initial>
  readonly resources: Layer.Layer<RemoteClient>
  /** The page's element in the browser; none where the build renders. */
  readonly container: Container
}) =>
  Site.placements.runtime({
    Model: Site.Model,
    container: options.container,
    initial: options.initial,
    update: Site.update,
    view,
    routing: {
      onUrlChange: (url: Url) => Site.Message.UrlChanged({ url }),
      onUrlRequest: (request: UrlRequest) => Site.Message.UrlRequested({ request }),
    },
    subscriptions: Subscription.make<Site.Model, Site.Message>()(() => ({
      // The window's scroll across the site's navigations, kept while it runs.
      scroll: Subscription.persistent(keepScroll()),
      // Where the reader may go next, read ahead (`PointedAtLink`).
      pointing: Subscription.persistent(
        Stream.map(pointedLinks(), url => Site.Message.PointedAtLink({ url })),
      ),
    })),
    resources: options.resources,
  })

/**
 * Whether the browser takes a page the build rendered over as it is. That page
 * shows the seed to a visitor, so only while the sandbox still holds the seed
 * and the page is read as a visitor; otherwise the site draws afresh in its
 * place, from the visitor's own sandbox and with their chair's links.
 */
export const takesOver = (page: ParentNode, reader: Chair, edited: boolean): boolean =>
  page.querySelector(`[${FOLDKIT_APP_ATTRIBUTE}][data-foldkit-plus-resume]`) !== null &&
  reader === 'visitor' &&
  !edited

import { Option, Stream } from 'effect'
import * as Subscription from 'foldkit/subscription'
import { fromString, toString as urlToString, type Url } from 'foldkit/url'

/**
 * The address of the link a reader points at or tabs to, on the page's own
 * origin: where they may go next, for a `Data.preload` before they go. Each
 * link once while they stay on it, since crossing its text sends one event
 * per element inside it. Without a document the stream is empty. Lift with
 * `Subscription.persistent`, mapping each address to a Message.
 */
export const pointedLinks = (): Stream.Stream<Url> => {
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

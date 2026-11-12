import { Option } from 'effect'

/**
 * The link an event target is in, when it is a candidate for preloading: on
 * the page's own origin and not marked `data-preload="none"`.
 */
export const preloadableLink = (target: EventTarget | null): Option.Option<HTMLAnchorElement> => {
  const link = target instanceof Element ? target.closest('a[href]') : null
  return link instanceof HTMLAnchorElement &&
    link.origin === window.location.origin &&
    link.dataset['preload'] !== 'none'
    ? Option.some(link)
    : Option.none()
}

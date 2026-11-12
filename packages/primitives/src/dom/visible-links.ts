import { Effect, Option, Queue, Stream } from 'effect'
import { fromString, type Url } from 'foldkit/url'
import { preloadableLink } from './preload-link.js'

type Connection = { readonly saveData?: boolean; readonly effectiveType?: string }

/** Whether the reader asked for less data, or is on a connection too slow to spend it speculatively. */
const frugal = (): boolean => {
  const connection = (navigator as { readonly connection?: Connection }).connection
  return (
    connection?.saveData === true ||
    connection?.effectiveType === 'slow-2g' ||
    connection?.effectiveType === '2g'
  )
}

/**
 * The address of each same-origin link that scrolls into view, for a
 * `Data.preload` before the reader reaches it. Opt-in: merge it into
 * `Site.routing`'s `preload.links` beside `pointedLinks()`; nothing preloads by
 * visibility unless it is asked for.
 *
 * Each address is read once per page, and at most `atMost` (8) addresses per
 * page, in the order they came into view: a page is the pathname and query
 * the document shows when a link is read, so a same-document navigation
 * counts the cap again. `margin` widens the viewport the way an
 * IntersectionObserver's `rootMargin` does. A link with `data-preload="none"`
 * is skipped, and so is every link under Save-Data, on a 2g connection, or
 * while the tab is hidden; a link that came into view then is not read later
 * unless it leaves and returns. Without a document or an IntersectionObserver
 * the stream is empty.
 */
export const visibleLinks = (
  options: { readonly atMost?: number; readonly margin?: string } = {},
): Stream.Stream<Url> => {
  if (typeof document === 'undefined' || typeof IntersectionObserver === 'undefined')
    return Stream.empty
  const atMost = options.atMost ?? 8
  return Stream.callback<Url>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        let page = ''
        let read = new Set<string>()
        const onIntersect = (entries: ReadonlyArray<IntersectionObserverEntry>): void => {
          if (frugal() || document.visibilityState === 'hidden') return
          const here = `${window.location.pathname}${window.location.search}`
          if (here !== page) {
            page = here
            read = new Set()
          }
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            const found = preloadableLink(entry.target)
            if (Option.isNone(found)) continue
            const link = found.value
            const url = fromString(link.href)
            if (Option.isNone(url)) continue
            if (read.has(link.href)) {
              observer.unobserve(link)
              continue
            }
            if (read.size >= atMost) return
            read.add(link.href)
            observer.unobserve(link)
            Queue.offerUnsafe(queue, url.value)
          }
        }
        const observer = new IntersectionObserver(onIntersect, {
          rootMargin: options.margin ?? '0px',
        })
        const observeIn = (root: ParentNode): void => {
          if (root instanceof HTMLAnchorElement && root.hasAttribute('href')) observer.observe(root)
          for (const link of root.querySelectorAll('a[href]')) observer.observe(link)
        }
        observeIn(document)
        const added = new MutationObserver(records => {
          for (const record of records)
            for (const node of record.addedNodes) if (node instanceof Element) observeIn(node)
        })
        added.observe(document, { childList: true, subtree: true })
        return () => {
          added.disconnect()
          observer.disconnect()
        }
      }),
      release => Effect.sync(release),
    ),
  )
}

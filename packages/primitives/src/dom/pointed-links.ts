import { Effect, Option, Queue, Stream } from 'effect'
import { fromString, type Url } from 'foldkit/url'

/** How long, in milliseconds, a pointer or focus rests on a link before it counts as intent. */
const REST = 50

const LISTENED = ['pointerover', 'pointerout', 'focusin', 'focusout'] as const

/**
 * The address of the link a reader means to follow, on the page's own
 * origin: for a `Data.preload` before they go (`Site.routing`'s `preload`).
 * A pointer or focus counts once it has rested on a link for 50 ms, and
 * leaving first cancels it, so a pointer sweeping a list reads one page, not
 * every page it crosses. A finger counts at once: the tap that follows is the
 * navigation. Crossing the elements inside a link is staying on it. Without
 * a document the stream is empty.
 */
export const pointedLinks = (): Stream.Stream<Url> => {
  if (typeof document === 'undefined') return Stream.empty
  const linkOf = (target: EventTarget | null): Option.Option<HTMLAnchorElement> => {
    const link = target instanceof Element ? target.closest('a[href]') : null
    return link instanceof HTMLAnchorElement && link.origin === window.location.origin
      ? Option.some(link)
      : Option.none()
  }
  // One listener for all four events, so they are read in the order they
  // happened: a focus moving between links sends its focusout and focusin in
  // one task, and a merge of four streams could read them the other way round.
  return Stream.callback<Url>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        // The link the reader is on, by its address, and the wait for it to count.
        let on: string | undefined
        let waiting: ReturnType<typeof setTimeout> | undefined
        const listener = (event: Event): void => {
          const found = linkOf(event.target)
          if (Option.isNone(found)) return
          const link = found.value
          if (event.type === 'pointerout' || event.type === 'focusout') {
            const related = 'relatedTarget' in event ? event.relatedTarget : null
            // Leaving for an element inside the same link is staying on it.
            if (related instanceof Node && link.contains(related)) return
            if (link.href !== on) return
            on = undefined
            clearTimeout(waiting)
            return
          }
          if (link.href === on) return
          on = link.href
          clearTimeout(waiting)
          const url = fromString(link.href)
          if (Option.isNone(url)) return
          if ('pointerType' in event && event.pointerType === 'touch')
            Queue.offerUnsafe(queue, url.value)
          else waiting = setTimeout(() => Queue.offerUnsafe(queue, url.value), REST)
        }
        for (const type of LISTENED) document.addEventListener(type, listener)
        return () => {
          clearTimeout(waiting)
          for (const type of LISTENED) document.removeEventListener(type, listener)
        }
      }),
      release => Effect.sync(release),
    ),
  )
}

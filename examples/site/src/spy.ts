/**
 * Scrollspy for the sidebars' lists of section links ("On this page", the
 * Primitives gallery's families). The lists are static regions the build drew,
 * so the browser never patches them: this reads the page's scroll, says which
 * section the reader is in, and the Command that follows marks its link where
 * it stands. The reading is a pure function of the headings' positions, so two
 * sections never trade places for a pixel.
 */
import { Effect, Equal, Option, Queue, Stream } from 'effect'

/** The static regions whose links name sections of the page. */
const LISTS = '[aria-label="On this page"], [aria-label="Primitives"]'

/** The links that point into this page, in the order the list draws them. */
const linksOf = (): ReadonlyArray<HTMLAnchorElement> =>
  Array.from(document.querySelectorAll<HTMLAnchorElement>(`:is(${LISTS}) a[href^="#"]`))

/** The id a link points at. */
const idOf = (link: HTMLAnchorElement): string => decodeURIComponent(link.hash.slice(1))

/** A section starts counting once its heading is this far below the viewport's top. */
const LEAD = 0.25

/**
 * The section a reader is in: the last whose heading has reached `lead` of the
 * way down the viewport, or the last of all once the page cannot scroll further
 * (its final heading may never get that high). `tops` are the headings'
 * distances from the viewport's top, in page order.
 */
export const sectionAt = (
  ids: ReadonlyArray<string>,
  tops: ReadonlyArray<number>,
  lead: number,
  atEnd: boolean,
): Option.Option<string> => {
  if (atEnd) return Option.fromNullishOr(ids.at(-1))
  // Headings run down the page, so those at or above `lead` are a prefix.
  const reached = tops.filter(top => top <= lead).length
  return Option.fromNullishOr(ids[reached - 1])
}

/** The section the page is scrolled to now; none when the page has no such links. */
const reading = (): Option.Option<string> => {
  const ids: Array<string> = []
  const tops: Array<number> = []
  for (const link of linksOf()) {
    const heading = document.getElementById(idOf(link))
    // A list drawn twice (a post's contents, beside its column and above it) names a section once.
    if (heading === null || ids.includes(idOf(link))) continue
    ids.push(idOf(link))
    tops.push(heading.getBoundingClientRect().top)
  }
  const root = document.documentElement
  const atEnd = window.scrollY > 0 && window.scrollY + window.innerHeight >= root.scrollHeight - 2
  return sectionAt(ids, tops, window.innerHeight * LEAD, atEnd)
}

/**
 * Where the reader is, from the moment the page is shown: nothing first, which
 * clears the last page's mark, then the section at each scroll or resize, once
 * per frame and only when it changes. It ends with the page; a page with no
 * section links reads none and listens to nothing.
 */
export const sections: Stream.Stream<Option.Option<string>> = Stream.concat(
  Stream.make(Option.none<string>()),
  Stream.callback<Option.Option<string>>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        let last: Option.Option<string> = Option.none()
        let frame = 0
        const read = (): void => {
          frame = 0
          const now = reading()
          if (Equal.equals(last, now)) return
          last = now
          Queue.offerUnsafe(queue, now)
        }
        const schedule = (): void => {
          if (frame === 0) frame = requestAnimationFrame(read)
        }
        if (linksOf().length === 0) return () => {}
        schedule()
        window.addEventListener('scroll', schedule, { passive: true })
        window.addEventListener('resize', schedule)
        return () => {
          window.removeEventListener('scroll', schedule)
          window.removeEventListener('resize', schedule)
          cancelAnimationFrame(frame)
        }
      }),
      release => Effect.sync(release),
    ),
  ),
)

/** Marks the link to `section` as the reader's place, and no other. */
export const markSection = (section: Option.Option<string>): void => {
  for (const link of linksOf()) {
    if (Option.exists(section, id => id === idOf(link)))
      link.setAttribute('aria-current', 'location')
    else link.removeAttribute('aria-current')
  }
}

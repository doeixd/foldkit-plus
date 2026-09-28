/**
 * The studio's sections in one document. Moving between them swaps the
 * application in place, keeping the loaded code and the open sandbox, where a
 * full load reparsed the one and reopened the other each time: most of a
 * second on a phone.
 */
import { Option } from 'effect'

export interface StudioOptions<Section extends string> {
  /** Where the sections are drawn: each gets a fresh container inside it. */
  readonly host: HTMLElement
  /** The section an address belongs to; none for one outside the studio. */
  readonly sectionOf: (pathname: string) => Option.Option<Section>
  readonly initial: Section
  /** Starts a section in `at`, returning what stops it. */
  readonly mount: (section: Section, at: HTMLElement) => () => void
  /** Whether a link keeps the reader, whose transport this document is bound to. */
  readonly sameReader: (url: URL) => boolean
}

/**
 * Mounts the initial section and takes over the moves between sections: a
 * link to another section, and Back or Forward across one. Both are answered
 * before the running application's own listeners, so it never sees an address
 * in another section. Returns what removes them.
 */
export const mountStudio = <Section extends string>(options: StudioOptions<Section>) => {
  const { host, sectionOf, mount, sameReader } = options
  let running = { section: options.initial, stop: () => {} }
  const start = (section: Section) => {
    running.stop()
    // An application draws in place of its container, so each gets a new one.
    const at = document.createElement('div')
    at.id = 'app'
    host.replaceChildren(at)
    running = { section, stop: mount(section, at) }
  }
  const clicked = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!(link instanceof HTMLAnchorElement) || link.target !== '') return
    const url = new URL(link.href)
    if (url.origin !== window.location.origin || !sameReader(url)) return
    const section = sectionOf(url.pathname)
    if (Option.isNone(section) || section.value === running.section) return
    event.preventDefault()
    event.stopPropagation()
    window.history.pushState({}, '', url)
    start(section.value)
  }
  const traversed = () => {
    const section = sectionOf(window.location.pathname)
    if (Option.isSome(section) && section.value !== running.section) start(section.value)
  }
  window.addEventListener('click', clicked, { capture: true })
  window.addEventListener('popstate', traversed)
  start(options.initial)
  return () => {
    window.removeEventListener('click', clicked, { capture: true })
    window.removeEventListener('popstate', traversed)
    running.stop()
  }
}

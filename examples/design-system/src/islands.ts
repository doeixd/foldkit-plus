/**
 * The catalog's sections that load as they near the window. Each island is its
 * own small runtime (`sections/*.ts`, which export `mount`): the page draws its
 * heading and an empty container, and `bootIslands` fills the container once
 * the section is within a screen of the window. An island's code, and what only
 * it uses of the packages, is not in the first bundle.
 */
export interface IslandBody {
  readonly mount: (container: HTMLElement) => void
}

interface Island {
  readonly id: string
  readonly load: () => Promise<IslandBody>
}

const islands: ReadonlyArray<Island> = [
  { id: 'buttons', load: () => import('./sections/buttons.js') },
  { id: 'form', load: () => import('./sections/form.js') },
  { id: 'choice', load: () => import('./sections/choice.js') },
  { id: 'overlays', load: () => import('./sections/overlays.js') },
  { id: 'feedback', load: () => import('./sections/feedback.js') },
  { id: 'navigation', load: () => import('./sections/navigation.js') },
  { id: 'calendar', load: () => import('./sections/date.js') },
  { id: 'collections', load: () => import('./sections/collections.js') },
  { id: 'utilities', load: () => import('./sections/utilities.js') },
]

/** The id of the container an island draws in, which the page puts under its heading. */
export const islandContainerId = (id: string): string => `${id}-island`

const boot = async (island: Island, container: HTMLElement): Promise<void> => {
  const body = await island.load()
  // A runtime replaces its container, so give it one of its own: the page's stays.
  const own = document.createElement('div')
  own.id = `${island.id}-body`
  container.replaceChildren(own)
  body.mount(own)
}

// Decided once: with no observer to say a section is near, every section loads now.
const loadWhenNear: (island: Island, container: HTMLElement) => void =
  typeof IntersectionObserver === 'undefined'
    ? (island, container) => void boot(island, container)
    : (island, container) => {
        const watcher = new IntersectionObserver(
          entries => {
            if (!entries.some(entry => entry.isIntersecting)) return
            watcher.disconnect()
            void boot(island, container)
          },
          { rootMargin: '600px 0px' },
        )
        watcher.observe(container)
      }

export const bootIslands = (): void => {
  for (const island of islands) {
    const container = document.getElementById(islandContainerId(island.id))
    if (container === null)
      throw new Error(`#${islandContainerId(island.id)} is missing from the page`)
    loadWhenNear(island, container)
  }
}

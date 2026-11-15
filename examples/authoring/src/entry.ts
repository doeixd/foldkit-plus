/**
 * The page: every section live, each in its own runtime and its own container.
 * Sections that appear twice carry ids of their own. The sections added for the
 * newer primitives load their code when they near the window, or all at once
 * where there is no IntersectionObserver, so the first load stays small.
 */
import { Style } from 'foldkit-mixins'
import { mountList } from './list/mount.js'
import { mountPopup } from './popup/mount.js'
import { mountSearch } from './search/mount.js'
import { CompactSearchField } from './search/view.js'
import { mountSortable } from './sortable/mount.js'
import { pageStylesheet } from './style.js'

Style.install(pageStylesheet)

const sections = document.getElementById('sections')
if (sections === null) throw new Error('#sections is missing from index.html')

const section = (title: string, ...ids: ReadonlyArray<string>): ReadonlyArray<HTMLElement> => {
  const element = document.createElement('section')
  const heading = document.createElement('h2')
  heading.textContent = title
  const row = document.createElement('div')
  row.className = 'row'
  const containers = ids.map(id => {
    const container = document.createElement('div')
    container.id = id
    return container
  })
  row.append(...containers)
  element.append(heading, row)
  sections.append(element)
  return containers
}

const [searchA, searchB] = section('Search field, shipped and compact', 'search-a', 'search-b')
mountSearch(searchA!, 'search-a')
mountSearch(searchB!, 'search-b', CompactSearchField)

const [list] = section('Editable, dismissible, reorderable list', 'list')
mountList(list!)

const [popupA, popupB] = section('Popup with a selection, twice', 'popup-a', 'popup-b')
mountPopup(popupA!, 'popup-a')
mountPopup(popupB!, 'popup-b')

const [sortable] = section('Sortable listbox: Alt+Enter grabs', 'sortable')
mountSortable(sortable!)

type Mount = (container: HTMLElement) => unknown

// Decided once: with no observer to say a section is near, every section loads now.
const loadWhenNear: (load: () => Promise<Mount>, container: HTMLElement) => void =
  typeof IntersectionObserver === 'undefined'
    ? (load, container) => void load().then(mount => mount(container))
    : (load, container) => {
        const watcher = new IntersectionObserver(
          entries => {
            if (!entries.some(entry => entry.isIntersecting)) return
            watcher.disconnect()
            void load().then(mount => mount(container))
          },
          { rootMargin: '600px 0px' },
        )
        watcher.observe(container)
      }

const lazySection = (title: string, id: string, load: () => Promise<Mount>) => {
  const [container] = section(title, id)
  loadWhenNear(load, container!)
}

lazySection('Inline edit with a Model that refuses values', 'inline-edit', () =>
  import('./inline-edit/mount.js').then(module => module.mountInlineEdit),
)
lazySection('Cards by arrows and a lasso', 'spatial', () =>
  import('./spatial/mount.js').then(module => module.mountSpatial),
)
lazySection('A box that moves and resizes on a grid', 'box', () =>
  import('./box/mount.js').then(module => module.mountBox),
)
lazySection('A stepper that repeats while pressed', 'stepper', () =>
  import('./stepper/mount.js').then(module => module.mountStepper),
)
lazySection('A row with swipe actions', 'swipe', () =>
  import('./swipe/mount.js').then(module => module.mountSwipe),
)
lazySection('A grid with paging and ranges', 'grid', () =>
  import('./grid/mount.js').then(module => module.mountGrid),
)
lazySection('Hotkeys and a labelled undo', 'hotkeys', () =>
  import('./hotkeys/mount.js').then(module => module.mountHotkeys),
)
// Remote and the agent are most of the page's weight, and only this section uses them.
lazySection('Editor an agent can save', 'editor', async () => {
  const [{ mountEditor }, { makeServer }] = await Promise.all([
    import('./save/mount.js'),
    import('./save/server.js'),
  ])
  const layer = makeServer().layer
  return container => mountEditor(container, layer)
})

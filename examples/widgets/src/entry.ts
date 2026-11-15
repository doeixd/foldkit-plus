/**
 * The interactive showcase: every widget live on one page, each as its own
 * island in its own section. Islands share nothing — the point of the page
 * is that each composition stands alone. Eager islands boot with the page; a
 * lazy one (`lazy.ts`) loads its code, installs its sheet and boots when its
 * section nears the window. The window list is last, since it makes the page long.
 */
import { Style } from 'foldkit-mixins'
import type { LazyIsland } from './island.js'
import { lazyIslands } from './lazy.js'
import { pageStylesheet } from './style.js'
import { islands, windowListIsland } from './widgets.js'

Style.install(pageStylesheet)
const eager = islands.filter(island => island.id !== windowListIsland.id)
Style.install(Style.stylesheet(...islands.map(island => island.style())))

const showcase = document.getElementById('showcase')
if (showcase === null) throw new Error('#showcase is missing from index.html')

const sectionOf = (id: string, title: string): HTMLElement => {
  const section = document.createElement('section')
  const heading = document.createElement('h2')
  heading.textContent = title
  const container = document.createElement('div')
  container.id = id
  section.append(heading, container)
  showcase.append(section)
  return container
}

const loadWhenNear = (island: LazyIsland, container: HTMLElement) => {
  const watcher = new IntersectionObserver(
    entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      watcher.disconnect()
      void island.load().then(body => {
        Style.install(Style.stylesheet(body.style()))
        body.mount(container)
      })
    },
    { rootMargin: '600px 0px' },
  )
  watcher.observe(container)
}

for (const island of eager) island.mount(sectionOf(island.id, island.title))
for (const island of lazyIslands) loadWhenNear(island, sectionOf(island.id, island.title))
windowListIsland.mount(sectionOf(windowListIsland.id, windowListIsland.title))

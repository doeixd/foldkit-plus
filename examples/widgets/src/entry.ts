/**
 * The interactive showcase: every widget live on one page, each as its own
 * island in its own section. Islands share nothing — the point of the page
 * is that each composition stands alone. Everything comes from the
 * registry; this file only installs the sheet and builds the sections.
 */
import { Style } from 'foldkit-mixins'
import { pageStylesheet } from './style.js'
import { islands } from './widgets.js'

Style.install(pageStylesheet)
Style.install(Style.stylesheet(...islands.map(island => island.style())))

const showcase = document.getElementById('showcase')
if (showcase === null) throw new Error('#showcase is missing from index.html')

for (const island of islands) {
  const section = document.createElement('section')
  const heading = document.createElement('h2')
  heading.textContent = island.title
  const container = document.createElement('div')
  container.id = island.id
  section.append(heading, container)
  showcase.append(section)
  island.mount(container)
}

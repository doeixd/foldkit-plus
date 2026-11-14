/**
 * The page: every section live, each in its own runtime and its own container.
 * Sections that appear twice carry ids of their own.
 */
import { Style } from 'foldkit-mixins'
import { mountList } from './list/mount.js'
import { mountPopup } from './popup/mount.js'
import { mountSearch } from './search/mount.js'
import { CompactSearchField } from './search/view.js'
import { mountEditor } from './save/mount.js'
import { makeServer } from './save/server.js'
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

const [editor] = section('Editor an agent can save', 'editor')
mountEditor(editor!, makeServer().layer)

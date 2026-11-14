/**
 * The page's search section: the two placements, and what `Assembly.describe`
 * says of the field, drawn as text so a document and a diagnostic read the
 * same value.
 */
import { Assembly, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { SearchField, SearchFieldSlots } from 'foldkit-mixins-ui'
import { searchPageStyle } from '../style.js'
import { SearchMessage } from './child.js'
import { First, Message, first, initial, second, update, type Model } from './app.js'
import { FieldStyle, SearchView } from './view.js'

/** The field's slots, recipe and pattern, and the view that places it. */
export const searchInspection = (): Assembly.Description =>
  Assembly.describe({
    name: 'Search',
    view: SearchView,
    links: [{ kind: 'bundle', name: 'Search' }],
    parts: [
      {
        name: 'SearchField',
        slots: SearchFieldSlots,
        styles: [FieldStyle],
        pattern: { name: 'searchField', pattern: SearchField.SearchFieldPattern },
      },
    ],
  })

export const SearchPageSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  inspection: Slot.make({ capability: Capability.Container }),
})

const description = searchInspection()

export const SearchFieldIsland = SlotView.forMessages<Message>()
  .define(SearchPageSlots, (model: Model, slots, h) =>
    h.div(slots.root.attrs(), [
      first.view(model, h),
      second.view(model, h),
      h.pre(slots.inspection.attrs([h.Id('search-inspection')]), [Assembly.textOf(description)]),
    ]),
  )
  .pipe(Style.attach(searchPageStyle(SearchPageSlots)))

export const runDemo = (): ReadonlyArray<string> => {
  const show = (model: Model) =>
    `first=${JSON.stringify(model.first.value)} second=${JSON.stringify(model.second.value)} results=${model.first.resultsOpen}`
  let model = initial
  const lines = [`start: ${show(model)}`]
  model = update(model, First.wrapper.make(SearchMessage.Typed({ value: 'alpha' }))).model
  model = update(model, First.wrapper.make(SearchMessage.OpenedResults())).model
  lines.push(`typed alpha and opened results in the first: ${show(model)}`)
  model = update(model, First.wrapper.make(SearchMessage.Cleared())).model
  lines.push(`cleared the first: ${show(model)}`)
  return lines
}

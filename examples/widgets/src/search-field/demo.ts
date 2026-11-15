/** The page's search section: the same field placed twice. */
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { searchPageStyle } from '../style.js'
import { SearchMessage } from './child.js'
import { First, Message, first, initial, second, update, type Model } from './app.js'

export const SearchPageSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
})

export const SearchFieldIsland = SlotView.forMessages<Message>()
  .define(SearchPageSlots, (model: Model, slots, h) =>
    h.div(slots.root.attrs(), [first.view(model, h), second.view(model, h)]),
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

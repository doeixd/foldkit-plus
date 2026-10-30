/**
 * The names under a heading that sticks to the top of the window while they
 * scroll past, and a count of the rows drawn, which stays near thirty however
 * far down the page is.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { WindowList, WindowListSlots } from 'foldkit-mixins-ui'
import { windowListIslandStyle, windowListRowsStyle } from '../style.js'
import { Message, NAMES, initial, update, type Model } from './app.js'

export const WindowListIslandSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  heading: Slot.make({ capability: Capability.Container }),
  name: Slot.make({ capability: Capability.Container }),
})

const layout = windowListIslandStyle(WindowListIslandSlots)
const rows = windowListRowsStyle(WindowListSlots)

/** The styles the island draws with, for the page's sheet. */
export const windowListStyles = [layout, rows] as const

const itemToKey = (name: string) => name

export const WindowListIsland = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(WindowListIslandSlots, [layout.mixin], {
    input: undefined,
    h,
  })
  const { start, end } = WindowList.windowOf(model.list, NAMES)
  return h.div(slots.root.attrs(), [
    h.p(slots.heading.attrs(), [`${NAMES.length} names, ${end - start} drawn`]),
    WindowList.view(
      {
        model: model.list,
        items: NAMES,
        itemToKey,
        itemToView: name => h.span(slots.name.attrs(), [name]),
        onMessage: message => Message.GotList({ message }),
        label: 'Names',
        style: rows,
      },
      h,
    ),
  ])
}

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const drawn = () => {
    const { start, end } = WindowList.windowOf(model.list, NAMES)
    return `rows ${start}-${end}`
  }
  const lines = [`start: ${drawn()}`]
  model = update(
    model,
    Message.GotList({ message: WindowList.Message.Placed({ top: 20_000, height: 800 }) }),
  ).model
  lines.push(`scrolled 20000px down: ${drawn()}`)
  return lines
}

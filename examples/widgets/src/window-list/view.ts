/**
 * The names under a heading that sticks to the top of the window while they
 * scroll past, and a count of the rows drawn, which stays near thirty however
 * far down the page is. A form above them goes to a row by its number
 * (`WindowList.reveal`), and each name is text the browser's find in page
 * matches while its row is not drawn (`findable`).
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { WindowList, WindowListSlots } from 'foldkit-mixins-ui'
import { windowListIslandStyle, windowListRowsStyle } from '../style.js'
import { goToStyle } from './style.js'
import { ISLAND, Message, NAMES, initial, update, type Model } from './app.js'

export const WindowListIslandSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  heading: Slot.make({ capability: Capability.Container }),
  name: Slot.make({ capability: Capability.Container }),
})

export const GoToSlots = Slots.define({
  form: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.TextInput }),
  go: Slot.make({ capability: Capability.Interactive }),
})

const goTo = goToStyle(GoToSlots)
const layout = windowListIslandStyle(WindowListIslandSlots)
const rows = windowListRowsStyle(WindowListSlots)

/** The styles the island draws with, for the page's sheet. */
export const windowListStyles = [layout, rows, goTo] as const

const GO_TO_ID = `${ISLAND}-go-to`
const itemToKey = (name: string) => name

export const WindowListIsland = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(WindowListIslandSlots, [layout.mixin], {
    input: undefined,
    h,
  })
  const goToSlots = SlotView.buildersFor(GoToSlots, [goTo.mixin], { input: undefined, h })
  const { start, end } = WindowList.windowOf(model.list, NAMES)
  return h.div(slots.root.attrs(), [
    h.form(goToSlots.form.attrs([h.OnSubmit(Message.WentToRow())]), [
      h.label(goToSlots.label.attrs([h.For(GO_TO_ID)]), ['Go to row']),
      h.input(
        goToSlots.input.attrs([
          h.Id(GO_TO_ID),
          h.Type('number'),
          h.Min('1'),
          h.Max(String(NAMES.length)),
          h.Required(true),
          h.Value(model.row),
          h.OnInput(text => Message.ChangedRow({ text })),
        ]),
      ),
      h.button(goToSlots.go.attrs([h.Type('submit')]), ['Go']),
    ]),
    h.p(slots.heading.attrs(), [`${NAMES.length} names, ${end - start} drawn`]),
    WindowList.view(
      {
        model: model.list,
        items: NAMES,
        itemToKey,
        // Focusable, so a name pressed or tabbed to stays drawn while the page scrolls away from it.
        itemToView: name => h.span(slots.name.attrs([h.Tabindex(-1)]), [name]),
        onMessage: message => Message.GotList({ message }),
        label: 'Names',
        findable: name => name,
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
  for (const text of ['700', '1200']) {
    model = update(model, Message.ChangedRow({ text })).model
    const went = update(model, Message.WentToRow())
    lines.push(`went to row ${text}: ${went.commands?.length ?? 0} reveal`)
  }
  return lines
}

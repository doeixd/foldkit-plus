/**
 * The palette as one SlotView: the query is a native search input (the
 * floor — no behavior types into it), and one shared Collection description
 * of the *matching* commands feeds identity, `ListNavigation` (one key
 * handler: arrows, Home/End, PageUp/Down, typeahead), and `Selection`
 * (clicks and `aria-selected`). Typing narrows; keys and clicks choose.
 */
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { ListNavigation, Selection } from 'foldkit-primitives/interaction'
import { Nav, Sel, Message, initial, matching, selectedOf, update, type Model } from './app.js'

export const CommandSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.Interactive }),
  list: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Focusable }),
})

const navArgs = {
  orientation: 'vertical',
  loop: true,
  virtual: false,
  timeoutMs: 500,
  page: 3,
} as const
const selArgs = { mode: 'single', allowEmpty: false } as const

const describeMatching = (model: Model) =>
  Behaviors.Collection.of(matching(model.query), {
    id: command => command.id,
  })

const Ids = Behaviors.Collection.behavior(CommandSlots)<Model, Message>({
  item: 'item',
  items: input => describeMatching(input),
})

const Keys = ListNavigation.behavior(Nav, navArgs)(CommandSlots)<Model, Message>({
  container: 'list',
  item: 'item',
  items: input => describeMatching(input),
  text: (input, index) => matching(input.query)[index]?.label ?? '',
})

const Picks = Selection.behavior(Sel, selArgs)(CommandSlots)<Model, Message>({
  container: 'list',
  item: 'item',
  items: input => describeMatching(input),
})

export const Command = SlotView.forMessages<Message>()
  .define(CommandSlots, (model: Model, slots, h) => {
    const shown = matching(model.query)
    const items = describeMatching(model)
    return h.div(slots.root.attrs([h.Role('dialog'), h.AriaLabel('Commands')]), [
      h.input(
        slots.input.attrs([
          h.Type('search'),
          h.AriaLabel('Search commands'),
          h.OnInput(text => Message.Queried({ text })),
          h.Value(model.query),
        ]),
      ),
      h.div(
        slots.list.attrs([h.Role('listbox'), h.AriaLabel('Matching commands')]),
        shown.map((command, index) =>
          h.div(slots.item.attrs([h.Key(command.id), h.Role('option')], items.slotItem(index)), [
            command.label,
          ]),
        ),
      ),
    ])
  })
  .pipe(Behavior.attach(Ids), Behavior.attach(Keys), Behavior.attach(Picks))

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial.model
  const lines = [`start: shown=${matching(model.query).length} selected=${selectedOf(model)}`]
  model = update(model, Message.Queried({ text: 'new' })).model
  lines.push(`typed new: shown=${matching(model.query).length}`)
  model = update(model, Sel.wrapper.make(Selection.Message.Activated({ id: 'new-folder' }))).model
  lines.push(`picked new-folder: selected=${selectedOf(model)}`)
  return lines
}

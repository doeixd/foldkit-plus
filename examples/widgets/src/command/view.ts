/**
 * The palette as one SlotView: the query is a native search input (the
 * floor — no behavior types into it), and one shared Collection description
 * of the *matching* commands feeds identity, `ListNavigation` (one key
 * handler: arrows, Home/End, PageUp/Down, typeahead), and `Selection`
 * (clicks and `aria-selected`). Typing narrows; keys and clicks choose.
 */
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { ListNavigation, Placing, Selection } from 'foldkit-primitives/interaction'
import { commandStyle } from '../style.js'
import {
  Nav,
  Sel,
  Message,
  initial,
  matching,
  navArgs,
  selArgs,
  selectedOf,
  textOf,
  update,
  type Model,
} from './app.js'

export const CommandSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.Interactive }),
  list: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Focusable }),
})

const describeMatching = (model: Model) =>
  Behaviors.Collection.of(matching(model.query), {
    id: command => command.id,
  })

const Ids = Behaviors.Collection.behavior(CommandSlots)<Model, Message>({
  item: 'item',
  items: input => describeMatching(input),
})

const Keys = ListNavigation.behavior(Nav, navArgs)(CommandSlots)<Model, Message>({
  container: 'input',
  item: 'item',
  items: input => describeMatching(input),
  text: (input, index) => matching(input.query)[index]?.label ?? '',
  typeahead: false,
  commit: (_input, id) => Sel.wrapper.make(Selection.Message.Activated({ id })),
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
  .pipe(
    Behavior.attach(Ids),
    Behavior.attach(Keys),
    Behavior.attach(Picks),
    Behavior.attach(Placing.keepWithin(CommandSlots)({ panel: 'list' })),
    Style.attach(commandStyle(CommandSlots)),
  )

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial.model
  const lines = [
    `start: shown=${matching(model.query).length} selected=${textOf(selectedOf(model))}`,
  ]
  model = update(model, Message.Queried({ text: 'new' })).model
  lines.push(`typed new: shown=${matching(model.query).length}`)
  model = update(model, Sel.wrapper.make(Selection.Message.Activated({ id: 'new-folder' }))).model
  lines.push(`picked new-folder: selected=${textOf(selectedOf(model))}`)
  return lines
}

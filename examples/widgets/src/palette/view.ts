/**
 * The palette as one SlotView: the command island's query, list, navigation
 * and pick, opened by a trigger and closed by running, Escape, or an outside
 * press under `Overlay.modal`. The panel draws only while open; choosing a
 * new command runs it through `update`, so the view never closes itself.
 */
import { Option } from 'effect'
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { ListNavigation, Overlay, Selection } from 'foldkit-primitives/interaction'
import { paletteStyle } from '../style.js'
import { Nav, Sel, matching, navArgs, selArgs, textOf } from '../command/app.js'
import { Message, Stack, initial, update, type Model } from './app.js'

export const PaletteSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Interactive }),
  backdrop: Slot.make({ capability: Capability.Container }),
  panel: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.Interactive }),
  list: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Focusable }),
})

const describeMatching = (model: Model) =>
  Behaviors.Collection.of(matching(model.query), {
    id: command => command.id,
  })

const Ids = Behaviors.Collection.behavior(PaletteSlots)<Model, Message>({
  item: 'item',
  items: input => describeMatching(input),
})

const Keys = ListNavigation.behavior(Nav, navArgs)(PaletteSlots)<Model, Message>({
  container: 'input',
  item: 'item',
  items: input =>
    Behaviors.Collection.of(input.open ? matching(input.query) : [], {
      id: command => command.id,
    }),
  text: (input, index) => matching(input.query)[index]?.label ?? '',
  typeahead: false,
  commit: (_input, id) => Sel.wrapper.make(Selection.Message.Activated({ id })),
})

const Picks = Selection.behavior(Sel, selArgs)(PaletteSlots)<Model, Message>({
  container: 'list',
  item: 'item',
  items: input => describeMatching(input),
})

const PaletteOverlay = Overlay.behaviors(PaletteSlots)<Model, Message, 'layers'>({
  stack: Stack,
  layer: 'panel',
  trigger: 'trigger',
  // Layer attribute, not an element id.
  id: () => 'palette-layer',
  policy: Overlay.modal,
})

export const Palette = SlotView.forMessages<Message>()
  .define(PaletteSlots, (model: Model, slots, h) => {
    const shown = matching(model.query)
    const items = describeMatching(model)
    return h.div(slots.root.attrs(), [
      h.button(slots.trigger.attrs([h.OnClick(Message.Opened({}))]), ['Commands']),
      ...(model.open
        ? [
            h.div(slots.backdrop.attrs([]), []),
            h.div(
              slots.panel.attrs([
                h.Role('dialog'),
                h.Attribute('aria-modal', 'true'),
                h.AriaLabel('Command palette'),
              ]),
              [
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
                    h.div(
                      slots.item.attrs(
                        [h.Key(command.id), h.Role('option')],
                        items.slotItem(index),
                      ),
                      [command.label],
                    ),
                  ),
                ),
              ],
            ),
          ]
        : []),
      ...(Option.isNone(model.lastRan) ? [] : [h.p([], [`Ran: ${model.lastRan.value}.`])]),
    ])
  })
  .pipe(
    Behavior.attach(Ids),
    Behavior.attach(Keys),
    Behavior.attach(Picks),
    ...PaletteOverlay.map(Behavior.attach),
    Style.attach(paletteStyle(PaletteSlots)),
  )

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial.model
  const lines = [`start: open=${model.open} ran=${textOf(model.lastRan)}`]
  model = update(model, Message.Opened({})).model
  lines.push(`opened: open=${model.open}`)
  model = update(model, Message.Queried({ text: 'new' })).model
  model = update(model, Sel.wrapper.make(Selection.Message.Activated({ id: 'new-folder' }))).model
  lines.push(`picked new-folder: open=${model.open} ran=${textOf(model.lastRan)}`)
  return lines
}

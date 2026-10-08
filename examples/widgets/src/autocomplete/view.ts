/**
 * The autocomplete as one SlotView: a native search input (the floor) with
 * `FieldAssociation` to its label, and one shared Collection description of
 * the *matching* fruits feeding identity, `ListNavigation` (one key handler),
 * and `Selection` (aria only — clicks are the parent's `PickedOption`, so
 * picking fills the query and closes in one transition). The popup is the
 * `Overlay.nonModal` policy: dismissed by Escape and outside press, focus
 * restored to the input, page usable throughout.
 */
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { ListNavigation, Overlay, Selection } from 'foldkit-primitives/interaction'
import { keepInView } from '../place.js'
import { autocompleteStyle } from '../style.js'
import { Nav, Sel, Stack, Message, initial, matching, update, type Model } from './app.js'

export const AutocompleteSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
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
const selArgs = { mode: 'single', allowEmpty: true } as const

const describeMatching = (model: Model) =>
  Behaviors.Collection.of(matching(model.query), {
    id: fruit => fruit,
  })

const Ids = Behaviors.Collection.behavior(AutocompleteSlots)<Model, Message>({
  item: 'item',
  items: input => describeMatching(input),
})

const Keys = ListNavigation.behavior(Nav, navArgs)(AutocompleteSlots)<Model, Message>({
  container: 'list',
  item: 'item',
  items: input => describeMatching(input),
  text: (input, index) => matching(input.query)[index] ?? '',
})

const Picks = Selection.behavior(Sel, selArgs)(AutocompleteSlots)<Model, Message>({
  container: 'list',
  item: 'item',
  items: input => describeMatching(input),
  click: false,
})

const Associated = Behaviors.FieldAssociation.behavior(AutocompleteSlots)<Model, Message>({
  control: 'input',
  label: 'label',
  id: () => 'fruit',
})

export const AutocompleteOverlay = Overlay.behaviors(AutocompleteSlots)<Model, Message, 'layers'>({
  stack: Stack,
  layer: 'list',
  trigger: 'input',
  id: () => 'fruit-popup',
  policy: Overlay.nonModal,
})

export const Autocomplete = SlotView.forMessages<Message>()
  .define(AutocompleteSlots, (model: Model, slots, h) => {
    const shown = matching(model.query)
    const items = describeMatching(model)
    return h.div(slots.root.attrs(), [
      h.label(slots.label.attrs(), ['Fruit']),
      h.input(
        slots.input.attrs([
          h.Type('search'),
          h.OnInput(text => Message.Queried({ text })),
          h.OnFocus(Message.Opened()),
          h.Value(model.query),
          h.Role('combobox'),
          h.AriaExpanded(model.open && shown.length > 0),
          h.AriaControls('fruit-popup'),
        ]),
      ),
      ...(model.open && shown.length > 0
        ? [
            h.div(
              slots.list.attrs([h.Role('listbox'), h.AriaLabel('Matching fruits')]),
              shown.map((fruit, index) =>
                h.button(
                  slots.item.attrs(
                    [h.Key(fruit), h.OnClick(Message.PickedOption({ id: fruit }))],
                    items.slotItem(index),
                  ),
                  [fruit],
                ),
              ),
            ),
          ]
        : []),
      ...(model.picked === null ? [] : [h.p([], [`Picked: ${model.picked}.`])]),
    ])
  })
  .pipe(
    Behavior.attach(Ids),
    Behavior.attach(Keys),
    Behavior.attach(Picks),
    Behavior.attach(Associated),
    ...AutocompleteOverlay.map(Behavior.attach),
    Behavior.attach(keepInView(AutocompleteSlots)({ panel: 'list' })),
    Style.attach(autocompleteStyle(AutocompleteSlots)),
  )

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial.model
  const lines = [`start: shown=${matching(model.query).length} picked=${model.picked}`]
  model = update(model, Message.Queried({ text: 'ap' })).model
  lines.push(`typed ap: shown=${matching(model.query).length} open=${model.open}`)
  model = update(model, Message.PickedOption({ id: 'apricot' })).model
  lines.push(`picked apricot: query=${model.query} open=${model.open} picked=${model.picked}`)
  return lines
}

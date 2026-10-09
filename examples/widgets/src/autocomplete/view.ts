/**
 * The autocomplete as one SlotView: a native search input (the floor) with
 * `FieldAssociation` to its label, and one shared Collection description of
 * the *matching* fruits feeding identity, `ListNavigation` (one key handler),
 * and `Selection` (aria only — clicks are the parent's `PickedOption`, so
 * picking fills the query and closes in one transition). The popup is the
 * `Overlay.nonModal` policy: dismissed by Escape and outside press, focus
 * restored to the input, page usable throughout.
 */
import { Option } from 'effect'
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { ListNavigation, Overlay, Placing, Selection } from 'foldkit-primitives/interaction'
import { autocompleteStyle } from '../style.js'
import {
  Nav,
  Sel,
  Stack,
  FIELD_ID,
  LIST_ID,
  Message,
  initial,
  matching,
  navArgs,
  selArgs,
  textOf,
  update,
  type Model,
} from './app.js'

export const AutocompleteSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.Interactive }),
  list: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Focusable }),
})

const describeMatching = (model: Model) =>
  Behaviors.Collection.of(matching(model.query), {
    id: fruit => fruit,
  })

const Ids = Behaviors.Collection.behavior(AutocompleteSlots)<Model, Message>({
  item: 'item',
  items: input => describeMatching(input),
})

const Keys = ListNavigation.behavior(Nav, navArgs)(AutocompleteSlots)<Model, Message>({
  container: 'input',
  item: 'item',
  items: input =>
    Behaviors.Collection.of(input.open ? matching(input.query) : [], { id: fruit => fruit }),
  text: (input, index) => matching(input.query)[index] ?? '',
  typeahead: false,
  commit: (_input, id) => Message.PickedOption({ id }),
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
  id: () => FIELD_ID,
})

export const AutocompleteOverlay = Overlay.behaviors(AutocompleteSlots)<Model, Message, 'layers'>({
  stack: Stack,
  layer: 'list',
  trigger: 'input',
  // Layer attribute, not the listbox element id `aria-controls` names.
  id: () => 'autocomplete-layer',
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
          h.AriaControls(LIST_ID),
        ]),
      ),
      ...(model.open && shown.length > 0
        ? [
            h.div(
              slots.list.attrs([h.Id(LIST_ID), h.Role('listbox'), h.AriaLabel('Matching fruits')]),
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
      ...(Option.isNone(model.picked) ? [] : [h.p([], [`Picked: ${model.picked.value}.`])]),
    ])
  })
  .pipe(
    Behavior.attach(Ids),
    Behavior.attach(Keys),
    Behavior.attach(Picks),
    Behavior.attach(Associated),
    ...AutocompleteOverlay.map(Behavior.attach),
    Behavior.attach(Placing.keepWithin(AutocompleteSlots)({ panel: 'list' })),
    Style.attach(autocompleteStyle(AutocompleteSlots)),
  )

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial.model
  const lines = [`start: shown=${matching(model.query).length} picked=${textOf(model.picked)}`]
  model = update(model, Message.Queried({ text: 'ap' })).model
  lines.push(`typed ap: shown=${matching(model.query).length} open=${model.open}`)
  model = update(model, Message.PickedOption({ id: 'apricot' })).model
  lines.push(
    `picked apricot: query=${model.query} open=${model.open} picked=${textOf(model.picked)}`,
  )
  return lines
}

import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

/**
 * Combobox is a nested Submodel: an `input`/`inputWrapper` pair with an
 * optional `toggleButton`, plus a `backdrop`/`items` group with an `item`
 * per entry (and `group`/`heading`/`separator` where the caller groups), so
 * the resolver runs once per bundle and each base attribute passes through
 * by identity. `hiddenInputs` are the form inputs submitted under
 * `formName`: generated markup with no styling surface, passed through for
 * the draw to place.
 *
 * The input owns `input`/`keydown`/`blur` (and `focus` with `openOnFocus`);
 * an item owns `click` while interactive; the toggle owns `click` while
 * enabled. A Behavior adding its own handler to one of those is a
 * conflict, not a second silent owner.
 *
 * From `chips` on, the slots are this package's: the chosen values as
 * chips in the field (the `chips` view input), the clear button
 * (`clearContent`), the panel shown in the list's place while there are no
 * items (`empty`), and an option's parts, which `parts` draws as Listbox's
 * does, the typed text marked in its label (`match`) and what a row holds
 * after its label (`itemTrailing`).
 *
 * A module of its own, which the adapter re-exports: the Behaviors that
 * attach to these slots are files of their own and read it at load.
 */
export const ComboboxSlots = Slots.define({
  wrapper: Slot.make({ capability: Capability.Container }),
  inputWrapper: Slot.make({ capability: Capability.Container }),
  input: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input, Event.KeyDown, Event.Blur, Event.Focus],
    attributes: [Attr.Role, Attr.AriaExpanded, Attr.Disabled, Attr.AriaDisabled],
  }),
  toggleButton: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded, Attr.Disabled, Attr.AriaDisabled],
  }),
  backdrop: Slot.make({ capability: Capability.Container, events: [Event.Click] }),
  items: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role],
  }),
  scroll: Slot.make({ capability: Capability.Container }),
  item: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaSelected, Attr.Disabled, Attr.AriaDisabled],
  }),
  group: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  heading: Slot.make({ capability: Capability.Container }),
  separator: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  rows: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
  indicator: Slot.make({ capability: Capability.Container }),
  scrollBar: Slot.make({ capability: Capability.Container }),
  scrollThumb: Slot.make({ capability: Capability.Container }),
  chips: Slot.make({ capability: Capability.Container }),
  chip: Slot.make({ capability: Capability.Container }),
  chipRemove: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.Disabled],
  }),
  clearButton: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
  empty: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  itemContent: Slot.make({ capability: Capability.Container }),
  itemIcon: Slot.make({ capability: Capability.Container }),
  itemText: Slot.make({ capability: Capability.Container }),
  itemLabel: Slot.make({ capability: Capability.Container }),
  itemDescription: Slot.make({ capability: Capability.Container }),
  itemTrailing: Slot.make({ capability: Capability.Container }),
  itemCheck: Slot.make({ capability: Capability.Container }),
  match: Slot.make({ capability: Capability.Container }),
})

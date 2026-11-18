import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

/**
 * Listbox is a nested Submodel: one `button`/`backdrop`/`items` group plus
 * an `item` per entry (and `group`/`heading`/`separator` where the caller
 * groups), so the resolver runs once per bundle and each base attribute
 * passes through by identity. `hiddenInputs` are the form inputs submitted
 * under `name`: generated markup with no styling surface, passed through
 * for the draw to place.
 *
 * The button owns `click` (and `pointerdown`/`keydown` while enabled); an
 * item owns `click` while interactive. A Behavior adding its own handler to
 * one of those is a conflict, not a second silent owner. Disabled buttons
 * and items publish no click, so the contract still lists it as allowed.
 *
 * The slots from `itemContent` on are the parts of a select drawn over the
 * listbox, which `parts` draws: an option's icon, label, description, what
 * it holds after the label and its check, and the trigger's value (or
 * placeholder) and chevron. `root` and `clear` are `Listbox.view`'s: the
 * element around the listbox, and the button that empties the choice.
 *
 * A module of its own, which the adapter re-exports: the Behaviors that
 * attach to these slots are files of their own and read it at load.
 */
export const ListboxSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  wrapper: Slot.make({ capability: Capability.Container }),
  button: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click, Event.PointerDown, Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaExpanded, Attr.Disabled, Attr.AriaDisabled],
  }),
  backdrop: Slot.make({ capability: Capability.Container, events: [Event.Click] }),
  items: Slot.make({
    capability: Capability.Container,
    events: [Event.KeyDown, Event.Blur],
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
  itemContent: Slot.make({ capability: Capability.Container }),
  itemIcon: Slot.make({ capability: Capability.Container }),
  itemText: Slot.make({ capability: Capability.Container }),
  itemLabel: Slot.make({ capability: Capability.Container }),
  itemDescription: Slot.make({ capability: Capability.Container }),
  itemTrailing: Slot.make({ capability: Capability.Container }),
  itemCheck: Slot.make({ capability: Capability.Container }),
  value: Slot.make({ capability: Capability.Container }),
  valueText: Slot.make({ capability: Capability.Container }),
  chevron: Slot.make({ capability: Capability.Container }),
  clear: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
})

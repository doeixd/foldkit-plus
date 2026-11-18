import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

/**
 * The tree's Slots. Each row is an `item` (the `treeitem`, which takes
 * focus) holding a `row` (the line drawn and clicked) and, when it holds
 * rows, a `group`. A node's `icon` stands in `icon`, its `trailing` after
 * the label in `trailing`, and its `action` at the row's end in `action`.
 */
export const TreeViewSlots = Slots.define({
  root: Slot.make({
    capability: Capability.Container,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
  item: Slot.make({
    capability: Capability.Focusable,
    events: [Event.Focus],
    attributes: [
      Attr.Role,
      Attr.AriaExpanded,
      Attr.AriaSelected,
      Attr.AriaChecked,
      Attr.AriaDisabled,
    ],
  }),
  row: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  chevron: Slot.make({ capability: Capability.Container }),
  /** The row's box in a `checkable` tree; pressing it checks the row and chooses nothing. */
  checkbox: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  icon: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  /** A node's `trailing`: a badge, a count, a time. */
  trailing: Slot.make({ capability: Capability.Container }),
  /** A node's `action`, at the row's end; the control inside takes its own presses. */
  action: Slot.make({ capability: Capability.Container }),
  group: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  highlight: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
})

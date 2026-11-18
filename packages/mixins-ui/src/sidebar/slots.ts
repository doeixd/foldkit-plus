import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

/** A sidebar's pieces: the column, its groups and rows, the rail's tips, the marker and the resize handle. */
export const SidebarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  header: Slot.make({ capability: Capability.Container }),
  footer: Slot.make({ capability: Capability.Container }),
  toggle: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded, Attr.AriaLabel],
  }),
  /** The phone's button that opens the navigation in a Sheet. */
  opener: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  nav: Slot.make({ capability: Capability.Container }),
  section: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  }),
  /** A group heading button's words. */
  title: Slot.make({ capability: Capability.Container }),
  /** A group's heading that shows and hides nothing. */
  heading: Slot.make({ capability: Capability.Container }),
  chevron: Slot.make({ capability: Capability.Container }),
  /** A group's rows, or a branch's (`data-nested`). */
  links: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Container }),
  link: Slot.make({ capability: Capability.Interactive }),
  /** A row that shows and hides the links nested under it. */
  branch: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  }),
  icon: Slot.make({ capability: Capability.Container }),
  /** What leads the header or footer (a logo, an avatar): all a rail shows of it. */
  mark: Slot.make({ capability: Capability.Container }),
  /** The rest of the header or footer, beside its mark; a rail hides it. */
  detail: Slot.make({ capability: Capability.Container }),
  /** A row's words; in an icon rail, kept for its name and hidden. */
  label: Slot.make({ capability: Capability.Container }),
  /** A row's count, at its end. */
  badge: Slot.make({ capability: Capability.Container }),
  /** Html at a row's end, after its words: a status dot, a shortcut, an avatar. */
  trailing: Slot.make({ capability: Capability.Container }),
  /** A button at a link's or a group heading's end (`data-action` on its item or section). */
  action: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
  /** What holds a rail row's control and its tooltip, laid out as the control alone. */
  tip: Slot.make({ capability: Capability.Container }),
  indicator: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
  /** A resizable column's handle on its inline-end edge, a `separator`. */
  resize: Slot.make({
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
})

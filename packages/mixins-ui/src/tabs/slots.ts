import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

/**
 * Tabs is a nested Submodel: one `tablist` group plus a `tab`/`panel` pair per
 * item, so the resolver runs once per group and each base `ChildAttribute`
 * bundle passes through by identity.
 *
 * Enabled tabs own `click` through the base `OnClick`; a Behavior adding its
 * own click handler is a conflict rather than a second silent owner. Disabled
 * tabs publish no click, so the contract still lists it as allowed.
 *
 * `indicator` and `highlight` have no upstream bundle: they are this
 * package's, drawn first in the tablist, for the marker under the chosen tab
 * and the hover that follows the pointer, which `fluid` moves. So are the
 * rest: `item` holds a tab and its `close` button side by side (a button in
 * a button is not allowed), and `label` and `icon` are the tab's words,
 * trimmed in a box of their own, and a mark before them.
 */
export const TabsSlots = Slots.define({
  /** What `Tabs.view` holds the tablist and the chosen panel in; `toView` draws none. */
  root: Slot.make({ capability: Capability.Container }),
  tablist: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  item: Slot.make({ capability: Capability.Container }),
  tab: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click, Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaSelected, Attr.Disabled, Attr.AriaDisabled],
  }),
  label: Slot.make({ capability: Capability.Container }),
  icon: Slot.make({ capability: Capability.Container }),
  close: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  panel: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  indicator: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
})

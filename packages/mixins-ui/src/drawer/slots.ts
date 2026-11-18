import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

export const DrawerSlots = Slots.define({
  panel: Slot.make({ capability: Capability.Container }),
  handle: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  }),
  body: Slot.make({ capability: Capability.Container }),
  /** More of the panel to drag it by, such as a row of tabs: vertical swipes drag, sideways ones scroll. */
  grip: Slot.make({ capability: Capability.Container }),
})

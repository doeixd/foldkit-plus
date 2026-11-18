import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

export const DisclosureSlots = Slots.define({
  /** Holds the button and its panel; drawn by `Disclosure.view`. */
  root: Slot.make({ capability: Capability.Container }),
  button: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaExpanded, Attr.AriaDisabled, Attr.Disabled],
  }),
  /** The view's `icon`, before the label. */
  icon: Slot.make({ capability: Capability.Container }),
  /** The button's text, so the icon and the chevron keep to its ends. */
  label: Slot.make({ capability: Capability.Container }),
  panel: Slot.make({ capability: Capability.Container }),
})

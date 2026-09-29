import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

/**
 * A segmented control: one `group` of pressed-button `option`s. Plain
 * buttons, not tabs: the group is `role="group"`, each option carries
 * `aria-pressed`, and there are no arrow keys or roving tabindex.
 */
export const SegmentedSlots = Slots.define({
  group: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
  option: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaPressed, Attr.Disabled, Attr.AriaDisabled],
  }),
})

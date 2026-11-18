import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

/**
 * The base bundle installs `OnChange` only when `onChange` is configured and
 * the control is enabled, so a Behavior that adds its own handler is a
 * conflict rather than a second silent owner.
 */
export const SelectSlots = Slots.define({
  /** The label, the control and the description, which `Select.view` stacks. */
  root: Slot.make({ capability: Capability.Container }),
  select: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.AriaLabel, Attr.AriaInvalid, Attr.Disabled, Attr.Value],
  }),
  /** One `option` of the list, and the `optgroup` that heads a run of them; a browser styles little of either. */
  option: Slot.make({ capability: Capability.Container }),
  group: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
})

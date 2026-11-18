import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'
import { ToggleRowSlots } from '../toggleRow.js'

/**
 * Mirrors the checkbox contract: both the control and its label own `click`.
 * `root`, `text`, `heading` and `aside` lay out the row `Switch.view` draws.
 */
export const SwitchSlots = Slots.define({
  ...ToggleRowSlots,
  button: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [
      Attr.Role,
      Attr.AriaChecked,
      Attr.AriaLabelledby,
      Attr.AriaDisabled,
      Attr.AriaInvalid,
      Attr.Disabled,
      Attr.Value,
    ],
  }),
  label: Slot.make({
    capability: Capability.Container,
    events: [Event.Click],
  }),
  description: Slot.make({ capability: Capability.Container }),
  hiddenInput: Slot.make({
    capability: Capability.Base,
    attributes: [Attr.Value],
  }),
})

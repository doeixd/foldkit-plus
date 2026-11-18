import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'
import { ToggleRowSlots } from '../toggleRow.js'

/**
 * Both the control and its label carry the base toggle handlers, so both own
 * `click`. `hiddenInput` exists only when a form `name` is configured; its base
 * bundle is then empty. `root`, `text`, `heading` and `aside` lay out the row
 * `Checkbox.view` draws; an application drawing its own through `toView` need
 * not use them.
 */
export const CheckboxSlots = Slots.define({
  ...ToggleRowSlots,
  checkbox: Slot.make({
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

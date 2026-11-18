import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

/**
 * A segmented control: one `group` of `option`s. A single choice, the
 * default, is the APG's radio group: `role="radiogroup"` of `role="radio"`
 * options with `aria-checked`, one tab stop (the chosen option, else the first
 * enabled), and the arrows, Home and End moving the choice and focus together.
 * With `multiple` it is shadcn's and Zag's toggle group: a `role="group"` of
 * buttons with `aria-pressed`, any number on, each filling itself (draw it
 * without `fluid`, whose pill marks one), every one a tab stop.
 * `indicator` and `highlight`, drawn first in the group, are the chosen
 * option's sliding pill and the hover that follows the pointer, which `fluid`
 * moves. `hiddenInput` carries the form value when the group has a `name`.
 */
export const SegmentedSlots = Slots.define({
  group: Slot.make({
    capability: Capability.Container,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel, Attr.AriaDisabled],
  }),
  option: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaPressed, Attr.AriaChecked, Attr.Disabled, Attr.AriaDisabled],
  }),
  /** An option's words, a box of their own so they can be trimmed apart from the option's steady copy. */
  label: Slot.make({ capability: Capability.Container }),
  /** A mark before an option's words, hidden from assistive technology. */
  icon: Slot.make({ capability: Capability.Container }),
  /** An option's mark and words in a row, drawn only for an option with an icon. */
  content: Slot.make({ capability: Capability.Container }),
  indicator: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
  /** One per chosen value, drawn when the group has a `name`, so a form submits them. */
  hiddenInput: Slot.make({ capability: Capability.Base, attributes: [Attr.Value] }),
})

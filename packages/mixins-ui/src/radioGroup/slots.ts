import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

/**
 * RadioGroup is a Submodel: each published bundle is a `ChildAttribute` group
 * that carries the boundary's dispatcher. The resolver treats those as opaque
 * and preserves their identity, so spreading a resolved bundle into the
 * parent's markup keeps routing through the radio group's `toParentMessage`.
 *
 * The base installs `OnClick` on an enabled, non-readonly option's `option`
 * bundle, so a Behavior adding its own click handler is a conflict rather than
 * a second silent owner.
 */
export const RadioGroupSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  /** The visible name of the group, drawn by `RadioGroup.view`. */
  legend: Slot.make({ capability: Capability.Container }),
  group: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role, Attr.AriaLabel, Attr.AriaInvalid, Attr.AriaDescribedby],
  }),
  option: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [
      Attr.Role,
      Attr.AriaChecked,
      Attr.AriaLabelledby,
      Attr.Disabled,
      Attr.AriaDisabled,
    ],
  }),
  label: Slot.make({ capability: Capability.Container }),
  /** The label and the description, stacked beside the radio. */
  text: Slot.make({ capability: Capability.Container }),
  icon: Slot.make({ capability: Capability.Container }),
  trailing: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  /**
   * An option's whole row, which the application draws around its radio and
   * words (a `label`, so a press anywhere on it presses the radio). No
   * upstream bundle: this package's, `data-checked` while its option is, so
   * a card recipe styles the row and its chosen look.
   */
  card: Slot.make({ capability: Capability.Container }),
  error: Slot.make({ capability: Capability.Container }),
  hiddenInput: Slot.make({
    capability: Capability.Base,
    attributes: [Attr.Value],
  }),
})

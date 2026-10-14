import { Attr, Behavior, Capability, Event, Slot, Slots } from 'foldkit-mixins'
import { FluidHover, Measure } from 'foldkit-primitives/dom'

/**
 * A segmented control: one `group` of pressed-button `option`s. Plain
 * buttons, not tabs: the group is `role="group"`, each option carries
 * `aria-pressed`, and there are no arrow keys or roving tabindex.
 * `indicator` and `highlight`, drawn first in the group, are the pressed
 * option's sliding pill and the hover that follows the pointer, which `fluid`
 * moves.
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
  indicator: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
})

const pressed = '[aria-pressed="true"]'

/**
 * What moves the `indicator` and `highlight`, on the group: the pressed
 * option is measured (`--fk-segmented-chosen-*`) and one highlight follows
 * the pointer to the nearest option (`--fk-segmented-hover-*`), born at the
 * pressed one. Pass them beside the style; until they run, the pressed option
 * fills itself.
 */
export const fluid = [
  Behavior.forSlots(SegmentedSlots)<unknown, never>(
    {
      group: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => Measure({ targets: { 'segmented-chosen': pressed } }),
      }),
    },
    { name: 'SegmentedChosen' },
  ).mixin,
  Behavior.forSlots(SegmentedSlots)<unknown, never>(
    {
      group: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () =>
          FluidHover({
            name: 'segmented-hover',
            item: '[aria-pressed]',
            axis: 'x',
            gapClick: true,
            from: pressed,
          }),
      }),
    },
    { name: 'SegmentedHover' },
  ).mixin,
] as const

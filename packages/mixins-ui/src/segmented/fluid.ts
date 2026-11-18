import { Behavior, Capability } from 'foldkit-mixins'
import { FluidHover, Measure } from 'foldkit-primitives/dom'
import { FollowDirection } from '../direction.js'
import { SegmentedSlots } from './slots.js'

// A chosen option is `aria-checked` in a single choice and `aria-pressed` in a multiple one.
const pressed = ':is([aria-pressed="true"], [aria-checked="true"])'

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
            item: ':is([aria-pressed], [aria-checked])',
            axis: 'x',
            gapClick: true,
            from: pressed,
          }),
      }),
    },
    { name: 'SegmentedHover' },
  ).mixin,
  // Measured again when the direction flips, which resizes nothing.
  Behavior.forSlots(SegmentedSlots)<unknown, never>(
    {
      group: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => FollowDirection(),
      }),
    },
    { name: 'SegmentedDirection' },
  ).mixin,
] as const

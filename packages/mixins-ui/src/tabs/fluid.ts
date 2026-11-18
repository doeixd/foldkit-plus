import { Behavior, Capability } from 'foldkit-mixins'
import { FluidHover, Measure } from 'foldkit-primitives/dom'
import { FollowDirection } from '../direction.js'
import { TabsSlots } from './slots.js'

const chosen = '[aria-selected="true"]'

/**
 * What moves the `indicator` and `highlight`: on the tablist, the chosen tab
 * is measured (`--fk-tabs-chosen-x`, `-y`, `-w`, `-h`, `-display`) and one
 * highlight follows the pointer to the nearest tab (`--fk-tabs-hover-*`),
 * growing out of the chosen tab and returning to it. Pass them beside the
 * style; until they run (before a page hydrates, or without them), each tab
 * marks itself and the drawn indicator and highlight show nothing.
 */
export const fluid = [
  Behavior.forSlots(TabsSlots)<unknown, never>(
    {
      tablist: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => Measure({ targets: { 'tabs-chosen': chosen } }),
      }),
    },
    { name: 'TabsChosen' },
  ).mixin,
  Behavior.forSlots(TabsSlots)<unknown, never>(
    {
      tablist: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () =>
          FluidHover({
            name: 'tabs-hover',
            item: '[role="tab"]',
            axis: 'xy',
            gapClick: true,
            from: chosen,
          }),
      }),
    },
    { name: 'TabsHover' },
  ).mixin,
  // Measured again when the direction flips, which resizes nothing.
  Behavior.forSlots(TabsSlots)<unknown, never>(
    {
      tablist: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => FollowDirection(),
      }),
    },
    { name: 'TabsDirection' },
  ).mixin,
] as const

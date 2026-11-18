import { Behavior, Capability } from 'foldkit-mixins'
import { FluidHover, Measure } from 'foldkit-primitives/dom'
import { SidebarSlots } from './slots.js'

const current = '[aria-current="page"]'

/**
 * What moves the `indicator` and `highlight`, on the navigation: the current
 * link is measured (`--fk-sidebar-chosen-*`), and one highlight follows the
 * pointer to the nearest row (`--fk-sidebar-hover-*`), born at the current
 * one. Pass them beside the style; until they run, the current link fills
 * itself. The phone's Sheet draws its own marker and highlight for them.
 */
export const fluid = [
  Behavior.forSlots(SidebarSlots)<unknown, never>(
    {
      nav: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => Measure({ targets: { 'sidebar-chosen': current } }),
      }),
    },
    { name: 'SidebarChosen' },
  ).mixin,
  Behavior.forSlots(SidebarSlots)<unknown, never>(
    {
      nav: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () =>
          FluidHover({
            name: 'sidebar-hover',
            item: ':is(a, [aria-expanded]):not([inert] *)',
            axis: 'y',
            gapClick: true,
            from: current,
          }),
      }),
    },
    { name: 'SidebarHover' },
  ).mixin,
] as const

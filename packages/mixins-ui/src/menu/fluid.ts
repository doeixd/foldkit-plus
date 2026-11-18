import { Behavior, Capability } from 'foldkit-mixins'
import { FluidHover } from 'foldkit-primitives/dom'
import { MenuSlots } from './slots.js'

/**
 * What moves the open panel's `highlight`: on its rows, one highlight
 * follows the pointer to the nearest row (`--fk-popup-hover-*`),
 * and to the row the keys mark (`data-active`) while the pointer is away.
 * Pass them beside the style; until they run, each row marks itself.
 */
export const fluid = [
  Behavior.forSlots(MenuSlots)<unknown, never>(
    {
      rows: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () =>
          FluidHover({
            name: 'popup-hover',
            item: '[role^="menuitem"]',
            axis: 'y',
            gapClick: true,
            follows: '[data-active]',
          }),
      }),
    },
    { name: 'MenuHover' },
  ).mixin,
] as const

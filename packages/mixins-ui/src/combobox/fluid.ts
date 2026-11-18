import { Behavior, Capability } from 'foldkit-mixins'
import { FluidHover, Measure } from 'foldkit-primitives/dom'
import { ComboboxSlots } from './slots.js'

const chosen = '[aria-selected="true"]'

/**
 * What moves the open panel's `highlight` and `indicator`: on its rows,
 * the chosen row is measured (`--fk-popup-chosen-*`) and one highlight
 * follows the pointer to the nearest row (`--fk-popup-hover-*`),
 * and to the row the keys mark (`data-active`) while the pointer is away. A press in a gap is left alone: the field keeps focus.
 * Pass them beside the style; until they run, each row marks itself.
 */
export const fluid = [
  Behavior.forSlots(ComboboxSlots)<unknown, never>(
    {
      rows: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => Measure({ targets: { 'popup-chosen': chosen } }),
      }),
    },
    { name: 'ComboboxChosen' },
  ).mixin,
  Behavior.forSlots(ComboboxSlots)<unknown, never>(
    {
      rows: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () =>
          FluidHover({
            name: 'popup-hover',
            item: '[role="option"]',
            axis: 'y',
            gapClick: false,
            follows: '[data-active]',
            from: chosen,
          }),
      }),
    },
    { name: 'ComboboxHover' },
  ).mixin,
] as const

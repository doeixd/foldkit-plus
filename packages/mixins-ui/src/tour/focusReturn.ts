import { Behavior, Capability } from 'foldkit-mixins'
import { FocusReturn } from 'foldkit-primitives/dom'
import { TourSlots } from './slots.js'

/**
 * Gives focus back when the tour ends: to what had it before the tour, then
 * by `FocusReturn`'s rules (an element with the opener's id, the opener's
 * `FocusRecovery` steps, the layer below, the page's first tabbable element).
 * Focus the reader moved elsewhere is left alone. The one way focus returns:
 * the tour keeps no opener of its own. Pass it among the mixins; opt in, as it
 * sends no Message.
 */
export const focusReturn = [
  Behavior.forSlots(TourSlots)<unknown, never>(
    {
      layer: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => FocusReturn(),
      }),
    },
    { name: 'TourFocusReturn' },
  ).mixin,
] as const

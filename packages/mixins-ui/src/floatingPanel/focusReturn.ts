import { Behavior, Capability } from 'foldkit-mixins'
import { FocusReturn } from 'foldkit-primitives/dom'
import { FloatingPanelSlots } from './slots.js'

/**
 * Gives focus back when the panel closes: to what had it before the panel,
 * then by `FocusReturn`'s rules (an element with the opener's id, the
 * opener's `FocusRecovery` steps, the layer below, the page's first tabbable
 * element). Focus the reader moved elsewhere is left alone. The one way focus
 * returns: the panel keeps no opener of its own. Pass it among the mixins;
 * opt in, as it sends no Message.
 */
export const focusReturn = [
  Behavior.forSlots(FloatingPanelSlots)<unknown, never>(
    {
      panel: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => FocusReturn(),
      }),
    },
    { name: 'FloatingPanelFocusReturn' },
  ).mixin,
] as const

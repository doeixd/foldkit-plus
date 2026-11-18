import { Behavior, Capability } from 'foldkit-mixins'
import { ScrollBars } from 'foldkit-primitives/dom'
import { DialogSlots } from './slots.js'

/**
 * The overlay bar on the dialog's `scroll`, the popups' list shape: pass it
 * among the mixins, and draw `scrollBar` (holding `scrollThumb`) beside
 * `scroll` in `body`. Where the pointer is coarse the browser's bar stays.
 */
export const overlayBars = [
  Behavior.forSlots(DialogSlots)<unknown, never>(
    {
      scroll: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => ScrollBars({}),
      }),
    },
    { name: 'DialogScrollBars' },
  ).mixin,
] as const

import { Behavior, Capability } from 'foldkit-mixins'
import { FocusReturn } from 'foldkit-primitives/dom'
import { DialogSlots } from './slots.js'

/**
 * A way back for focus when the element that opened the dialog is gone when
 * it closes (removed by the action the dialog was opened for, or drawn again
 * as a new element): upstream's return goes to the opener and, with none, to
 * `body`. This goes by `FocusReturn`'s rules: an element with the opener's id,
 * the opener's `FocusRecovery` fallback steps, the dialog below, then the
 * page's first tabbable element. Pass it among the mixins; opt in, as it
 * sends no Message.
 */
export const focusReturn = [
  Behavior.forSlots(DialogSlots)<unknown, never>(
    {
      panel: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => FocusReturn(),
      }),
    },
    { name: 'DialogFocusReturn' },
  ).mixin,
] as const

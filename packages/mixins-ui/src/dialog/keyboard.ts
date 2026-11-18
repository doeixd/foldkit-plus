import { Behavior, Capability } from 'foldkit-mixins'
import { KeyboardInset } from 'foldkit-primitives/dom'
import { DialogSlots } from './slots.js'

/**
 * The on-screen keyboard's height on the `panel` (`--fk-keyboard-inset`), which the Dialog
 * and Sheet recipes keep the panel above: iOS Safari, and Chrome on Android unless the page
 * asks otherwise, leave a fixed panel under the keys when a field in it takes focus. Pass it
 * among the mixins of a dialog or sheet that holds a field. Opt in, as it sends no Message.
 */
export const keyboard = [
  Behavior.forSlots(DialogSlots)<unknown, never>(
    {
      panel: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => KeyboardInset({}),
      }),
    },
    { name: 'DialogKeyboard' },
  ).mixin,
] as const

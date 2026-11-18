import { Behavior, Capability } from 'foldkit-mixins'
import { ScrollBars } from 'foldkit-primitives/dom'
import { CommandSlots } from './slots.js'

/**
 * What draws the bar over the `list` (`ScrollBars`), in place of the
 * browser's, on a pointer that can hover; pass it beside the style. Not a
 * default: its Mount sends no Message, yet a Scene test of every page that
 * drew one would have to resolve it.
 */
export const overlayBars = [
  Behavior.forSlots(CommandSlots)<unknown, never>(
    {
      list: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => ScrollBars({}),
      }),
    },
    { name: 'CommandScrollBars' },
  ).mixin,
] as const

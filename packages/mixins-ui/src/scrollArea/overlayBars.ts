import { Behavior, Capability } from 'foldkit-mixins'
import { ScrollBars } from 'foldkit-primitives/dom'
import { ScrollAreaSlots } from './slots.js'

/**
 * What draws the area's bars over its `viewport` (`ScrollBars`), in place of
 * the browser's, on a pointer that can hover; pass it beside the style. Not a
 * default: its Mount sends no Message, yet a Scene test of every page that
 * drew one would have to resolve it.
 */
export const overlayBars = [
  Behavior.forSlots(ScrollAreaSlots)<unknown, never>(
    {
      viewport: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => ScrollBars({}),
      }),
    },
    { name: 'ScrollAreaScrollBars' },
  ).mixin,
] as const

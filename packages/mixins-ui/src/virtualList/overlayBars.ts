import { Behavior, Capability } from 'foldkit-mixins'
import { ScrollBars } from 'foldkit-primitives/dom'
import { VirtualListSlots } from './slots.js'

/**
 * What draws the bar over upstream's list (`ScrollBars`, run from `root`), in
 * place of the browser's, on a pointer that can hover; pass it beside the
 * style. Not a default: its Mount sends no Message, yet a Scene test of every
 * page that drew one would have to resolve it.
 */
export const overlayBars = [
  Behavior.forSlots(VirtualListSlots)<unknown, never>(
    {
      root: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => ScrollBars({ scroller: ':scope > ul' }),
      }),
    },
    { name: 'VirtualListScrollBars' },
  ).mixin,
] as const

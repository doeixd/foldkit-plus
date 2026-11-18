import { Behavior, Capability } from 'foldkit-mixins'
import { ScrollBars } from 'foldkit-primitives/dom'
import { MenuSlots } from './slots.js'

/**
 * What draws the open panel's `scrollBar` over its `scroll` (`ScrollBars`),
 * in place of the browser's bar, on a pointer that can hover. Pass it beside
 * the style when the menu scrolls (`itemsScrollAttributes`); without a
 * `scroll` there is no bar.
 */
export const overlayBars = [
  Behavior.forSlots(MenuSlots)<unknown, never>(
    {
      scroll: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => ScrollBars({}),
      }),
    },
    { name: 'MenuScrollBars' },
  ).mixin,
] as const

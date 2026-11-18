import { Behavior, Capability } from 'foldkit-mixins'
import { ScrollBars } from 'foldkit-primitives/dom'
import { ListboxSlots } from './slots.js'

/**
 * What draws the open panel's `scrollBar` over its `scroll` (`ScrollBars`),
 * in place of the browser's bar, on a pointer that can hover. Pass it beside
 * the style when the listbox scrolls (`itemsScrollAttributes`); without a
 * `scroll` there is no bar.
 */
export const overlayBars = [
  Behavior.forSlots(ListboxSlots)<unknown, never>(
    {
      scroll: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => ScrollBars({}),
      }),
    },
    { name: 'ListboxScrollBars' },
  ).mixin,
] as const

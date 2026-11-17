import { Behavior, Capability } from 'foldkit-mixins'
import { ScrollBars } from 'foldkit-primitives/dom'
import { ComboboxSlots } from './slots.js'

/**
 * What draws the open panel's `scrollBar` over its `scroll` (`ScrollBars`),
 * in place of the browser's bar, on a pointer that can hover; a press on the
 * bar leaves the field its focus. Pass it beside the style when the combobox
 * scrolls (`itemsScrollAttributes`); without a `scroll` there is no bar.
 */
export const overlayBars = [
  Behavior.forSlots(ComboboxSlots)<unknown, never>(
    {
      scroll: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => ScrollBars({}),
      }),
    },
    { name: 'ComboboxScrollBars' },
  ).mixin,
] as const

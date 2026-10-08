import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A status pill publishes one slot; it owns no state, messages, or
 * bundles. The pill reads its tone from `data-tone`, which the `Badge`
 * recipe maps to a family; values outside the map keep the base.
 */
export const BadgeSlots = Slots.define({
  badge: Slot.make({ capability: Capability.Container }),
})

/**
 * A status pill in one call: its words, the tone they carry, a style for
 * its slot, and mixins beside the style. No upstream component stands
 * behind it.
 */
export interface BadgeView {
  readonly text: string
  /** The tone value the recipe maps, such as 'success'. Omit it for the base. */
  readonly tone?: string | undefined
  /** A style of `BadgeSlots`, for the pill's look. */
  readonly style?: NamedStyle<typeof BadgeSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<never> | undefined
}

export const view = (options: BadgeView, h: HtmlBuilder<never>): Html => {
  const builders = SlotView.buildersFor(
    BadgeSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  return h.span(
    builders.badge.attrs([
      ...(options.tone === undefined ? [] : [h.DataAttribute('tone', options.tone)]),
    ]),
    [options.text],
  )
}

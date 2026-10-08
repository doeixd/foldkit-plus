import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A loading placeholder publishes one slot; it owns no state, messages, or
 * bundles. Stack several for multi-line content; each bar pulses on its own.
 * The bar reports through `status`: what it stands in for arrives separately.
 */
export const SkeletonSlots = Slots.define({
  bar: Slot.make({ capability: Capability.Container }),
})

/**
 * One shimmering bar in one call: what it stands in for, a style for its
 * slot, and mixins beside the style. No upstream component stands behind it.
 */
export interface SkeletonView {
  /** What the bar stands in for, announced politely. */
  readonly label?: string | undefined
  /** A style of `SkeletonSlots`, for the bar's look. */
  readonly style?: NamedStyle<typeof SkeletonSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<never> | undefined
}

export const view = (options: SkeletonView, h: HtmlBuilder<never>): Html => {
  const builders = SlotView.buildersFor(
    SkeletonSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  return h.div(
    builders.bar.attrs([
      h.Role('status'),
      ...(options.label === undefined ? [] : [h.AriaLabel(options.label)]),
    ]),
    [],
  )
}

import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A loading spinner publishes one slot; it owns no state, messages, or
 * bundles. It says work is ongoing where a bar would mislead about
 * progress; pair it with `Skeleton` for content taking shape.
 */
export const SpinnerSlots = Slots.define({
  wheel: Slot.make({ capability: Capability.Container }),
})

/**
 * A spinner in one call: what is loading, a style for its slot, and mixins
 * beside the style. No upstream component stands behind it.
 */
export interface SpinnerView {
  /** What is loading, announced politely. */
  readonly label?: string | undefined
  /** A style of `SpinnerSlots`, for the wheel's look. */
  readonly style?: NamedStyle<typeof SpinnerSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<never> | undefined
}

export const view = (options: SpinnerView, h: HtmlBuilder<never>): Html => {
  const builders = SlotView.buildersFor(
    SpinnerSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  return h.div(
    builders.wheel.attrs([
      h.Role('status'),
      ...(options.label === undefined ? [] : [h.AriaLabel(options.label)]),
    ]),
    [],
  )
}

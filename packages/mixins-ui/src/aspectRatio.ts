import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A fixed-ratio frame publishes one slot; it owns no state, messages, or
 * bundles. The ratio is the recipe's, so a stylist can change it.
 */
export const AspectRatioSlots = Slots.define({
  frame: Slot.make({ capability: Capability.Container }),
})

/**
 * A frame in one call: the content it crops to the ratio, a style for its
 * slot, and mixins beside the style.
 */
export interface AspectRatioView {
  readonly content?: Html | undefined
  /** A style of `AspectRatioSlots`, for the frame's look. */
  readonly style?: NamedStyle<typeof AspectRatioSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<never> | undefined
}

export const view = (options: AspectRatioView, h: HtmlBuilder<never>): Html => {
  const builders = SlotView.buildersFor(
    AspectRatioSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  return h.div(builders.frame.attrs(), options.content === undefined ? [] : [options.content])
}

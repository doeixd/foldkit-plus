import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A scroll area publishes one slot; it owns no state, messages, or bundles.
 * The browser owns scrolling; this owns the box: which axes may scroll and
 * how the bars read. The height that makes it scroll stays the caller's (a
 * mixin beside the style), since only the caller knows the layout it sits in.
 */
export const ScrollAreaSlots = Slots.define({
  viewport: Slot.make({ capability: Capability.Container }),
})

/**
 * A scroll area in one call: what scrolls inside it, a style for its slot,
 * and mixins beside the style (including the height that makes it scroll).
 * No upstream component stands behind it.
 */
export interface ScrollAreaView {
  readonly content: Html
  /** A style of `ScrollAreaSlots`, for the area's look. */
  readonly style?: NamedStyle<typeof ScrollAreaSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<never> | undefined
}

export const view = (options: ScrollAreaView, h: HtmlBuilder<never>): Html => {
  const builders = SlotView.buildersFor(
    ScrollAreaSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  return h.div(builders.viewport.attrs([h.Tabindex(0)]), [options.content])
}

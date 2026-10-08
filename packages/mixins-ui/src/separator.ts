import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A separator publishes one slot; it owns no state, messages, or bundles.
 * Vertical separators need their container to constrain the cross axis:
 * a bare `div` stretches, which is what makes the rule visible.
 */
export const SeparatorSlots = Slots.define({
  rule: Slot.make({ capability: Capability.Container }),
})

/**
 * A thematic break in one call: horizontal by default, vertical when the
 * layout runs that way. A separator between menu items is decorative and
 * stays out of the tab order on its own.
 */
export interface SeparatorView {
  readonly orientation?: 'horizontal' | 'vertical' | undefined
  /** A style of `SeparatorSlots`, for the rule's look. */
  readonly style?: NamedStyle<typeof SeparatorSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<never> | undefined
}

export const view = (options: SeparatorView, h: HtmlBuilder<never>): Html => {
  const builders = SlotView.buildersFor(
    SeparatorSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const vertical = options.orientation === 'vertical'
  return h.div(
    builders.rule.attrs([
      h.Role('separator'),
      h.AriaOrientation(vertical ? 'vertical' : 'horizontal'),
    ]),
    [],
  )
}

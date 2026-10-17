import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A separator publishes its rule, and for a labelled one the frame that
 * holds two rules and the label between them; it owns no state, messages,
 * or bundles. Vertical separators need their container to constrain the
 * cross axis: a bare `div` stretches, which is what makes the rule visible.
 */
export const SeparatorSlots = Slots.define({
  rule: Slot.make({ capability: Capability.Container }),
  root: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
})

/**
 * A thematic break in one call: horizontal by default, vertical when the
 * layout runs that way. A separator is never in the tab order.
 */
export interface SeparatorView<Message = never> {
  readonly orientation?: 'horizontal' | 'vertical' | undefined
  /**
   * Words in the middle of the rule ("or", a date in a feed). They are read
   * as text, and the two rules beside them are drawing.
   */
  readonly label?: string | undefined
  /** Drawing only, as between rows of a menu that already reads as groups: no `separator` role. */
  readonly decorative?: boolean | undefined
  /** A style of `SeparatorSlots`, for the rule's look. */
  readonly style?: NamedStyle<typeof SeparatorSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const view = <Message = never>(
  options: SeparatorView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    SeparatorSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const orientation = options.orientation === 'vertical' ? 'vertical' : 'horizontal'
  if (options.label === undefined) {
    return h.div(
      builders.rule.attrs(
        options.decorative === true
          ? [h.Role('none')]
          : [h.Role('separator'), h.AriaOrientation(orientation)],
      ),
      [],
    )
  }
  // A `separator` role makes its children presentational, which would hide the label.
  const line = () =>
    h.div(builders.rule.attrs([h.AriaHidden(true)]), [])
  return h.div(builders.root.attrs(), [
    line(),
    h.span(builders.label.attrs(), [options.label]),
    line(),
  ])
}

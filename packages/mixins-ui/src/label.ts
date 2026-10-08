import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A form label publishes one slot; it owns no state, messages, or bundles.
 * It names a control through `for`: pass the id `FieldAssociation` derived,
 * never a second naming scheme beside it.
 */
export const LabelSlots = Slots.define({
  label: Slot.make({ capability: Capability.Container }),
})

/**
 * A label in one call: the control it names, its words, a style for its
 * slot, and mixins beside the style. No upstream component stands behind it.
 */
export interface LabelView {
  /** The id of the control this labels. */
  readonly for: string
  readonly text: string
  /** A style of `LabelSlots`, for the label's look. */
  readonly style?: NamedStyle<typeof LabelSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<never> | undefined
}

export const view = (options: LabelView, h: HtmlBuilder<never>): Html => {
  const builders = SlotView.buildersFor(
    LabelSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  return h.label(builders.label.attrs([h.For(options.for)]), [options.text])
}

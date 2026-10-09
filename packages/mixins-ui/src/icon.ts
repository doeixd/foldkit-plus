import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * An icon publishes one slot; it owns no state, messages, or bundles.
 * A label makes it an image. Without one it is decorative and hidden from
 * the accessibility tree. `Icons.glyph` is the other tool: a mask on an
 * element that already exists.
 */
export const IconSlots = Slots.define({
  glyph: Slot.make({ capability: Capability.Container }),
})

/**
 * An icon in one call: the drawing it holds, the name it has when it means
 * something, a style for its slot, and mixins beside the style.
 */
export interface IconView {
  readonly content: Html
  /** Announced as an image. Omitted, the icon is decorative. */
  readonly label?: string | undefined
  /** A style of `IconSlots`, for the glyph's look. */
  readonly style?: NamedStyle<typeof IconSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<never> | undefined
}

export const view = (options: IconView, h: HtmlBuilder<never>): Html => {
  const builders = SlotView.buildersFor(
    IconSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  if (options.label !== undefined) {
    return h.span(builders.glyph.attrs([h.Role('img'), h.AriaLabel(options.label)]), [
      options.content,
    ])
  }
  return h.span(builders.glyph.attrs([h.AriaHidden(true)]), [options.content])
}

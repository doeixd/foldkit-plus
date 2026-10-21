import { Icon, type IconData } from 'foldkit-media'
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
 * An icon in one call: the icon it draws, the name it has when it means
 * something, a style for its slot, and mixins beside the style.
 */
export interface IconView<Message = never> {
  /** An icon as data: an import from `virtual:foldkit-icons/…`, or a package's constant. */
  readonly icon: IconData
  /** Parts two copies of one icon on a page, whose ids would otherwise collide (`Icon.draw`'s `key`). */
  readonly key?: string | undefined
  /** Announced as an image. Omitted, the icon is decorative. */
  readonly label?: string | undefined
  /** A style of `IconSlots`, for the glyph's look. */
  readonly style?: NamedStyle<typeof IconSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const view = <Message = never>(
  options: IconView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    IconSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const drawing = Icon.draw(options.icon, h, options.key === undefined ? {} : { key: options.key })
  if (options.label !== undefined) {
    return h.span(builders.glyph.attrs([h.Role('img'), h.AriaLabel(options.label)]), [drawing])
  }
  return h.span(builders.glyph.attrs([h.AriaHidden(true)]), [drawing])
}

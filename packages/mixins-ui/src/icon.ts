import { Icon, type IconData } from 'foldkit-media'
import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * An icon publishes the box it stands in and a `mark` on its corner; it owns
 * no state, messages, or bundles. A label makes it an image. Without one it is
 * decorative and hidden from the accessibility tree. `Icons.glyph` is the other
 * tool: a mask on an element that already exists.
 */
export const IconSlots = Slots.define({
  glyph: Slot.make({ capability: Capability.Container }),
  mark: Slot.make({ capability: Capability.Container }),
})

interface IconCommon<Message> {
  /** Announced as an image. Omitted, the icon is decorative. */
  readonly label?: string | undefined
  /**
   * A badge or a dot on the box's corner (a status on a tile). It stands inside
   * the box, so it is part of the image when the icon has a `label` and hidden
   * with it when it has none: put what it means into the `label`.
   */
  readonly mark?: Html | undefined
  /** A style of `IconSlots`, for the glyph's look. */
  readonly style?: NamedStyle<typeof IconSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/**
 * An icon in one call: the icon it draws or a drawing of your own (initials,
 * a count, an emoji), the name it has when it means something, a style for its
 * slots, and mixins beside the style.
 */
export type IconView<Message = never> = IconCommon<Message> &
  (
    | {
        /** An icon as data: an import from `virtual:foldkit-icons/…`, or a package's constant. */
        readonly icon: IconData
        /** Parts two copies of one icon on a page, whose ids would otherwise collide (`Icon.draw`'s `key`). */
        readonly key?: string | undefined
        readonly glyph?: undefined
      }
    | {
        /** A drawing of your own in the box: initials, a count, an emoji, an `svg` you wrote. */
        readonly glyph: Html
        readonly icon?: undefined
        readonly key?: undefined
      }
  )

export const view = <Message = never>(
  options: IconView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    IconSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const drawing =
    options.glyph === undefined
      ? Icon.draw(options.icon, h, options.key === undefined ? {} : { key: options.key })
      : options.glyph
  const marked = options.mark === undefined ? [] : [h.span(builders.mark.attrs(), [options.mark])]
  return h.span(
    builders.glyph.attrs(
      options.label === undefined
        ? [h.AriaHidden(true)]
        : [h.Role('img'), h.AriaLabel(options.label)],
    ),
    [drawing, ...marked],
  )
}

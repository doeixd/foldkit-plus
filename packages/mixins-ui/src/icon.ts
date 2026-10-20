import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import { Icon as MediaIcon, type IconData, type SvgNode } from 'foldkit-media'
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
export interface IconView<Message = never> {
  readonly content: Html
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
  if (options.label !== undefined) {
    return h.span(builders.glyph.attrs([h.Role('img'), h.AriaLabel(options.label)]), [
      options.content,
    ])
  }
  return h.span(builders.glyph.attrs([h.AriaHidden(true)]), [options.content])
}

/**
 * An icon's drawing as inline SVG, `1em` square (a glyph's box when drawn in
 * `view`) and hidden from assistive technology: the control or `view` it sits
 * in carries its name. Every attribute is written as an attribute, so a server
 * render writes the same markup. Ids are prefixed by the icon's content
 * (`Icon.key` of `foldkit-media`); `key` sets one drawing's ids apart from
 * another of the same icon, since a gradient defined in a copy that is hidden
 * paints nothing for the copy that shows.
 */
export const draw = <Message>(
  icon: IconData,
  h: HtmlBuilder<Message>,
  options: { readonly key?: string } = {},
): Html => {
  const prefix = MediaIcon.key(icon) + (options.key === undefined ? '' : `-${options.key}`)
  const { viewBox, attributes, nodes } = MediaIcon.prefixIds(icon, prefix)
  const written = (from: Readonly<Record<string, string>>) =>
    Object.entries(from).map(([name, value]) => h.Attribute(name, value))
  const drawn = ({ tag, attributes, children }: SvgNode): Html =>
    h[tag](written(attributes), children.map(drawn))
  return h.svg(
    [
      h.Attribute('viewBox', viewBox),
      h.Attribute('width', '1em'),
      h.Attribute('height', '1em'),
      h.AriaHidden(true),
      ...written(attributes),
    ],
    nodes.map(drawn),
  )
}

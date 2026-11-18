import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * Set type publishes one slot; it owns no state, messages, or bundles. The
 * level chooses the element: headings stay headings, body copy stays a
 * paragraph, and asides keep their `small`, `blockquote`, and `code`
 * semantics. Longform rhythm between unlike elements stays `Prose`'s; this
 * is the single voice, wherever it stands.
 */
export const TypographySlots = Slots.define({
  text: Slot.make({ capability: Capability.Container }),
})

/**
 * One voice of the type scale, and the element it speaks through. The
 * interface roles (`display` to `micro`) are paragraphs; a role that names a
 * section is a heading's look, so give it `h2` and that role's style.
 */
export type TypographyLevel =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'lead'
  | 'body'
  | 'small'
  | 'muted'
  | 'quote'
  | 'code'
  | 'display'
  | 'title'
  | 'subtitle'
  | 'caption'
  | 'micro'

/** What the voice says: text, or `content` where it holds a link or emphasis; never both. */
export type TypographySays =
  | { readonly text: string; readonly content?: undefined }
  | { readonly content: ReadonlyArray<Html | string>; readonly text?: undefined }

/**
 * One voice of the type scale in one call: its level, what it says, a style
 * for its slot, and mixins beside the style. The level picks the element and
 * is written as `data-level`, which the recipe reads. No upstream component
 * stands behind it.
 */
export type TypographyView<Message = never> = TypographySays & {
  readonly level: TypographyLevel
  /** A style of `TypographySlots`, for the type's look. */
  readonly style?: NamedStyle<typeof TypographySlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const view = <Message = never>(
  options: TypographyView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    TypographySlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const attrs = builders.text.attrs([h.DataAttribute('level', options.level)])
  const says = options.content ?? [options.text]
  switch (options.level) {
    case 'h1':
      return h.h1(attrs, says)
    case 'h2':
      return h.h2(attrs, says)
    case 'h3':
      return h.h3(attrs, says)
    case 'h4':
      return h.h4(attrs, says)
    case 'small':
      return h.small(attrs, says)
    case 'quote':
      return h.blockquote(attrs, says)
    case 'code':
      return h.code(attrs, says)
    default:
      return h.p(attrs, says)
  }
}

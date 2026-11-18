import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'
import { fill, wordsOf } from './words.js'

/**
 * A status pill publishes the pill, the box its `icon` stands in and the
 * button that dismisses it; it owns no state, messages, or bundles. The pill
 * reads its tone from `data-tone`, which the `Badge` recipe maps to a
 * family; values outside the vocabulary keep the base.
 */
export const BadgeSlots = Slots.define({
  badge: Slot.make({ capability: Capability.Container }),
  icon: Slot.make({ capability: Capability.Container }),
  dismiss: Slot.make({ capability: Capability.Interactive }),
})

export interface BadgeWords {
  /** The dismiss button's accessible name. */
  readonly dismiss: string
  /** What the dismiss button draws. */
  readonly mark: string
  /** A link that opens a new tab says so to a screen reader. */
  readonly external: string
}

/** The defaults, in English: text with `{blanks}`, as the other widgets' words. */
export const words: BadgeWords = {
  dismiss: 'Dismiss {text}',
  mark: '×',
  external: 'Opens in a new tab',
}

interface BadgeCommon<Message> {
  readonly text: string
  /**
   * A tone of the recipe's vocabulary (`accent`, `neutral`, `info`,
   * `success`, `warning`, `danger`), or a value a `badgeTones` map names.
   * Omit it for the base.
   */
  readonly tone?: string | undefined
  /** A drawing before the text (an `svg`, an avatar, a flag), hidden from assistive technology. */
  readonly icon?: Html | undefined
  /** A style of `BadgeSlots`, for the pill's look. */
  readonly style?: NamedStyle<typeof BadgeSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
  /** The dismiss button's and the link's words. */
  readonly words?: Partial<BadgeWords> | undefined
}

/** A pill that may be dismissed, or a link; a link holds no button inside it. */
export type BadgeView<Message = never> = BadgeCommon<Message> &
  (
    | {
        /** Draws a dismiss button that sends this. */
        readonly onDismiss?: NoInfer<Message> | undefined
        readonly href?: undefined
        readonly external?: undefined
      }
    | {
        /** Draws the pill as a link. */
        readonly href: string
        /** Open in a new tab, and say so to a screen reader. */
        readonly external?: boolean | undefined
        readonly onDismiss?: undefined
      }
  )

export const view = <Message = never>(
  options: BadgeView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    BadgeSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const text = wordsOf(words, options.words)
  const content: ReadonlyArray<Html | string> = [
    ...(options.icon === undefined
      ? []
      : [h.span(builders.icon.attrs([h.AriaHidden(true)]), [options.icon])]),
    options.text,
    ...(options.onDismiss === undefined
      ? []
      : [
          h.button(
            builders.dismiss.attrs([
              h.Type('button'),
              h.AriaLabel(fill(text.dismiss, { text: options.text })),
              h.OnClick(options.onDismiss),
            ]),
            [text.mark],
          ),
        ]),
  ]
  const marks = options.tone === undefined ? [] : [h.DataAttribute('tone', options.tone)]
  if (options.href === undefined) return h.span(builders.badge.attrs(marks), content)
  const external = options.external === true
  return h.a(
    builders.badge.attrs([
      ...marks,
      h.Href(options.href),
      ...(external
        ? [h.Target('_blank'), h.Rel('noopener noreferrer'), h.AriaDescription(text.external)]
        : []),
    ]),
    content,
  )
}

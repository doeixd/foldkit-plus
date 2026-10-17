import { Attr, Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * An assistant at work, as ChatGPT's and Claude's "Thinking…": a mark (three
 * dots, or the view's own icon), the words, and a second line saying what it
 * is doing. The root is a polite status drawn always: with `active` false it
 * is an empty region, so it is in the page before it speaks, and the words
 * that arrive in it are announced. The mark is hidden from assistive
 * technology; the words carry the status. It owns no state or messages.
 */
export const ThinkingIndicatorSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  mark: Slot.make({ capability: Capability.Container }),
  dot: Slot.make({ capability: Capability.Container }),
  /** The view's own icon, drawn in the mark in place of the dots. */
  icon: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  detail: Slot.make({ capability: Capability.Container }),
})

export interface ThinkingIndicatorView<Message = never> {
  /** The words; default `Thinking`. */
  readonly label?: string | undefined
  /** What the assistant is doing, under the words: `Searching the web`. */
  readonly detail?: string | undefined
  /**
   * Whether it is at work; default true. False draws the region empty, so
   * keep it drawn with false where work is about to start.
   */
  readonly active?: boolean | undefined
  /** Drawn in the mark in place of the dots, carrying no meaning of its own. */
  readonly icon?: Html | undefined
  /** A style of `ThinkingIndicatorSlots`, for the look. */
  readonly style?: NamedStyle<typeof ThinkingIndicatorSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const DOTS = 3

export const view = <Message = never>(
  options: ThinkingIndicatorView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    ThinkingIndicatorSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const root = builders.root.attrs([h.Role('status')])
  if (options.active === false) return h.div(root, [])
  const { icon, detail } = options
  return h.div(root, [
    h.span(
      builders.mark.attrs([h.AriaHidden(true)]),
      icon === undefined
        ? Array.from({ length: DOTS }, () => h.span(builders.dot.attrs(), []))
        : [h.span(builders.icon.attrs(), [icon])],
    ),
    h.span(builders.label.attrs(), [options.label ?? 'Thinking']),
    ...(detail === undefined ? [] : [h.span(builders.detail.attrs(), [detail])]),
  ])
}

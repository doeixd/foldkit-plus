import { Option } from 'effect'
import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A figure publishes its root (a `figure`) and its caption (a `figcaption`);
 * it owns no state or messages. The caption names the figure for assistive
 * technology by itself, so it needs no ARIA of its own.
 */
export const FigureSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  caption: Slot.make({ capability: Capability.Container }),
})

/** A figure in one call: what it shows (an `Image.view`, a chart, a code block) and its caption. */
export interface FigureView<Message = never> {
  readonly content: Html
  /** Words under the content; without one, the figure is the content alone. */
  readonly caption?: Html | string | undefined
  /** A style of `FigureSlots`, for the figure's look. */
  readonly style?: NamedStyle<typeof FigureSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const view = <Message = never>(
  options: FigureView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    FigureSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  return h.figure(builders.root.attrs([]), [
    options.content,
    ...Option.match(Option.fromNullishOr(options.caption), {
      onNone: () => [],
      onSome: caption => [h.figcaption(builders.caption.attrs([]), [caption])],
    }),
  ])
}

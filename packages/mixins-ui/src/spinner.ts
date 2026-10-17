import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A loading spinner publishes its wheel, the three parts a kind may draw
 * with (dots, bars, an orbiting dot), and, with words beside it, the frame
 * and the words; it owns no state, messages, or bundles. It says work is
 * ongoing where a bar would mislead about progress; pair it with `Skeleton`
 * for content taking shape. The parts are always drawn, so the kind is the
 * style's choice and changes no markup.
 */
export const SpinnerSlots = Slots.define({
  wheel: Slot.make({ capability: Capability.Container }),
  part: Slot.make({ capability: Capability.Container }),
  root: Slot.make({ capability: Capability.Container }),
  text: Slot.make({ capability: Capability.Container }),
})

/**
 * A spinner in one call: what is loading, said aloud or shown beside it, a
 * style for its slots, and mixins beside the style. No upstream component
 * stands behind it.
 */
export interface SpinnerView<Message = never> {
  /** What is loading, announced politely. */
  readonly label?: string | undefined
  /** Show the label beside the wheel, where it is read as the status's words. */
  readonly showLabel?: boolean | undefined
  /** A style of `SpinnerSlots`, for the wheel's look. */
  readonly style?: NamedStyle<typeof SpinnerSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const PARTS = 3

export const view = <Message = never>(
  options: SpinnerView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    SpinnerSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const parts = Array.from({ length: PARTS }, () => h.span(builders.part.attrs(), []))
  const { label } = options
  if (options.showLabel !== true || label === undefined) {
    return h.div(
      builders.wheel.attrs([
        h.Role('status'),
        ...(label === undefined ? [] : [h.AriaLabel(label)]),
      ]),
      parts,
    )
  }
  return h.div(builders.root.attrs([h.Role('status')]), [
    h.span(builders.wheel.attrs([h.AriaHidden(true)]), parts),
    h.span(builders.text.attrs(), [label]),
  ])
}

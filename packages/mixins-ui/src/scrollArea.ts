import { Behavior, Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { ScrollBars } from 'foldkit-primitives/dom'
import type { MixinList } from './resolve.js'

/**
 * A scroll area owns no state, messages, or bundles. The browser owns
 * scrolling; this owns the box: which axes may scroll and how the bars read.
 * The `viewport` scrolls; the `root` around it holds an overlay `bar` per
 * axis, each with its `thumb`, which `overlayBars` drives. The height that
 * makes it scroll stays the caller's (a mixin beside the style), since only
 * the caller knows the layout it sits in.
 */
export const ScrollAreaSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  viewport: Slot.make({ capability: Capability.Container }),
  bar: Slot.make({ capability: Capability.Container }),
  thumb: Slot.make({ capability: Capability.Container }),
})

/**
 * A scroll area in one call: what scrolls inside it, a style for its slots,
 * and mixins beside the style (including the height that makes it scroll).
 * No upstream component stands behind it.
 */
export interface ScrollAreaView<Message = never> {
  readonly content: Html
  /** A style of `ScrollAreaSlots`, for the area's look. */
  readonly style?: NamedStyle<typeof ScrollAreaSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const view = <Message = never>(
  options: ScrollAreaView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    ScrollAreaSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  // Drawn whether or not `overlayBars` runs: a bar no Mount marks scrollable
  // is not drawn by the style. Hidden from assistive technology: the viewport
  // is what a reader scrolls.
  const bar = (axis: 'block' | 'inline') =>
    h.div(builders.bar.attrs([h.DataAttribute('scroll-bar', axis), h.AriaHidden(true)]), [
      h.div(builders.thumb.attrs(), []),
    ])
  return h.div(builders.root.attrs(), [
    h.div(builders.viewport.attrs([h.Tabindex(0)]), [options.content]),
    bar('block'),
    bar('inline'),
  ])
}

/**
 * What draws the area's bars over its `viewport` (`ScrollBars`), in place of
 * the browser's, on a pointer that can hover; pass it beside the style. Not a
 * default: its Mount sends no Message, yet a Scene test of every page that
 * drew one would have to resolve it.
 */
export const overlayBars = [
  Behavior.forSlots(ScrollAreaSlots)<unknown, never>(
    {
      viewport: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => ScrollBars({}),
      }),
    },
    { name: 'ScrollAreaScrollBars' },
  ).mixin,
] as const

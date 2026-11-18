import { SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { layered, type PresetOption, type Presets } from './configure.js'
import type { MixinList } from './resolve.js'
import { overlayBars } from './scrollArea/overlayBars.js'
import { ScrollAreaSlots } from './scrollArea/slots.js'

export { overlayBars }
export { ScrollAreaSlots }

/**
 * A scroll area owns no state, messages, or bundles. The browser owns
 * scrolling; this owns the box: which axes may scroll and how the bars read.
 * The height that makes it scroll stays the caller's (a mixin beside the
 * style), since only the caller knows the layout it sits in.
 */

/**
 * A scroll area in one call: what scrolls inside it, a style for its slots,
 * and mixins beside the style (including the height that makes it scroll).
 * No upstream component stands behind it.
 */
export interface ScrollAreaView<Message = never> {
  readonly content: Html
  /**
   * The region's name. With one, the viewport is a `region` landmark of that
   * name; without, it is a focusable box with no role, which a screen reader
   * announces as nothing. The viewport is a tab stop either way: a scroller
   * with no focusable content must be reachable by keyboard (WCAG 2.1.1),
   * and only Chromium and Firefox make one reachable by themselves.
   */
  readonly label?: string | undefined
  /** A style of `ScrollAreaSlots`, for the area's look. */
  readonly style?: NamedStyle<typeof ScrollAreaSlots> | undefined
  /** Mixins beside the style: `ScrollArea.overlayBars`, and the height that makes it scroll. */
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
    h.div(
      builders.viewport.attrs([
        h.Tabindex(0),
        ...(options.label === undefined ? [] : [h.Role('region'), h.AriaLabel(options.label)]),
      ]),
      [options.content],
    ),
    bar('block'),
    bar('inline'),
  ])
}

/** What a ScrollArea is given once: its look, and the bars and height that make it scroll. */
export type ScrollAreaPreset = Pick<ScrollAreaView<never>, 'style'> & {
  readonly mixins?: MixinList<never>
}

/**
 * The application's own ScrollArea: `base` for every use, `presets` chosen at
 * a use with `preset`, and the call over both. `mixins` concatenate in that
 * order (`ScrollArea.overlayBars` goes in `base`); any other option given at
 * the call replaces the preset's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<ScrollAreaPreset, Names>,
): {
  readonly view: <Message = never>(
    options: ScrollAreaView<Message> & PresetOption<Names>,
    h: HtmlBuilder<Message>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})

/**
 * The overlay scrollbar every scrolling recipe shares, after Fluid
 * Functionalism's: a bar `ScrollBars` drives beside the scroller, 10px wide
 * so it is easy to reach, holding a thumb that rests 4px wide in a faint ink
 * 2px off the edge, widens to 6px and darkens under the pointer, and darkens
 * again while dragged. The bar fades in on `moderate` and out on its quicker
 * exit, after a `moderate` delay that lets a widened thumb narrow first; the
 * widening travels, so reduced motion keeps only the fades. Internal to the
 * recipes, not a published contract.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { component, ref, travelled } from './design.js'

/** The thumb's ink: a share of the text color, by `state-hover` (12%), so it reads on any ground. */
const ink = (share: string) =>
  `color-mix(in oklab, currentColor calc(${ref.knob['state-hover']} * ${share}), transparent)`

/** How wide the bar is: the thumb's room and the pointer's target. */
const reach = '10px'
const inset = '2px'
const rest = '4px'
const wide = '6px'

/** On a scroller: the browser's bar gives way while `ScrollBars` draws its own. */
export const overlaid: StyleValue = component(
  Style.pseudo('[data-scroll-overlaid]', { scrollbarWidth: 'none' }),
  Style.nest('&[data-scroll-overlaid]::-webkit-scrollbar', { display: 'none' }),
)

/** On the parent of another component's scroller, which no slot reaches: the same, one level down. */
export const overlaidChild: StyleValue = component(
  Style.nest('& > [data-scroll-overlaid]', { scrollbarWidth: 'none' }),
  Style.nest('& > [data-scroll-overlaid]::-webkit-scrollbar', { display: 'none' }),
)

const block = '&[data-scroll-bar="block"]'
const inline = '&[data-scroll-bar="inline"]'

/** A bar over the scroller's edge, drawn only while its axis has more to scroll. */
export const bar: StyleValue = component(
  Style.self({
    position: 'absolute',
    display: 'none',
    zIndex: '1',
    touchAction: 'none',
    userSelect: 'none',
    WebkitTouchCallout: 'none',
    opacity: '0',
    transitionProperty: 'opacity',
    transitionDuration: ref.motion['moderate-exit'],
    transitionTimingFunction: ref.motion['ease-exit'],
    transitionDelay: ref.motion.moderate,
  }),
  Style.nest(block, { insetBlock: '0', insetInlineEnd: '0', inlineSize: reach }),
  Style.nest(inline, { insetInline: '0', insetBlockEnd: '0', blockSize: reach }),
  Style.pseudo('[data-scrollable]', { display: 'block' }),
  Style.pseudo('[data-shown]', {
    opacity: '1',
    transitionDuration: ref.motion.moderate,
    transitionTimingFunction: ref.motion.ease,
    transitionDelay: '0s',
  }),
)

/** A thumb whose bar the pointer is on, or is dragging. */
const reached = (axis: 'block' | 'inline') =>
  `:where([data-scroll-bar="${axis}"]:is(:hover, [data-dragging])) > &`

/**
 * The thumb inside a bar. Its length and place are `ScrollBars`'s (physical
 * pixels from the bar's top or left); its breadth and ink are the pointer's.
 */
export const thumb: StyleValue = component(
  Style.self({
    position: 'absolute',
    borderRadius: ref.radius.full,
    background: ink('2 / 3'),
    pointerEvents: 'none',
  }),
  Style.nest(':where([data-scroll-bar="block"]) > &', {
    top: '0',
    insetInlineEnd: inset,
    inlineSize: rest,
    blockSize: 'var(--fk-scroll-thumb-size, 0px)',
    translate: '0 var(--fk-scroll-thumb-offset, 0px)',
    transitionProperty: 'inline-size, background-color',
    transitionDuration: `${travelled(ref.motion.fast)}, ${ref.motion.fast}`,
    transitionTimingFunction: ref.motion.ease,
  }),
  Style.nest(':where([data-scroll-bar="inline"]) > &', {
    left: '0',
    insetBlockEnd: inset,
    blockSize: rest,
    inlineSize: 'var(--fk-scroll-thumb-size, 0px)',
    translate: 'var(--fk-scroll-thumb-offset, 0px) 0',
    transitionProperty: 'block-size, background-color',
    transitionDuration: `${travelled(ref.motion.fast)}, ${ref.motion.fast}`,
    transitionTimingFunction: ref.motion.ease,
  }),
  Style.nest(reached('block'), { inlineSize: wide, background: ink('1') }),
  Style.nest(reached('inline'), { blockSize: wide, background: ink('1') }),
  Style.nest(':where([data-scroll-bar][data-dragging]) > &', { background: ink('4 / 3') }),
)

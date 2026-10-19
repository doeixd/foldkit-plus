/**
 * A toast stack after Sonner: cards at a corner or the middle of an edge,
 * the newest in front. Collapsed, the ones behind peek out a step under the
 * front one, each smaller and clipped to its height; held (`data-expanded`)
 * they spread out, each above the last at its measured height
 * (`Toast.Stack`'s properties). A card enters from its edge on the `slow`
 * spring and fades out as it leaves, carrying on the way it was swiped,
 * while the cards behind restack at once on the `moderate` settle; each
 * movement travels, so reduced motion keeps only the fades. The icon draws
 * its type's mark in
 * the type's ink, a turning ring for `loading` (`turning`, still under
 * reduced motion); `tone: 'rich'` tints the whole card in its type, as
 * Sonner's `richColors`. A card drawn outside the component's list (the
 * fork's) lays out in a plain column.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { nests, raise, raisedSurface, role } from 'foldkit-mixins/theme'
import { ToastSlots } from '../toast.js'
import {
  component,
  focusRing,
  hover,
  ref,
  travelled,
  turning,
  unfilledHover,
  variant,
} from './design.js'

/** A mask of a 20×20 drawing in the text's colour. */
const mask = (path: string) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath fill-rule='evenodd' d='${path}'/%3E%3C/svg%3E")`

const marks = {
  success: mask(
    'M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z',
  ),
  error: mask(
    'M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.7 7.3a1 1 0 0 0-1.4 1.4L8.6 10l-1.3 1.3a1 1 0 1 0 1.4 1.4l1.3-1.3 1.3 1.3a1 1 0 0 0 1.4-1.4L11.4 10l1.3-1.3a1 1 0 0 0-1.4-1.4L10 8.6 8.7 7.3Z',
  ),
  warning: mask(
    'M8.3 3.1c.8-1.4 2.7-1.4 3.4 0l6 10.6c.8 1.3-.2 3-1.7 3H4c-1.5 0-2.5-1.7-1.7-3l6-10.6ZM11 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1-8a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1Z',
  ),
  info: mask(
    'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a1 1 0 0 0 0 2v3a1 1 0 0 0 1 1h1a1 1 0 1 0 0-2v-3a1 1 0 0 0-1-1H9Z',
  ),
  close: mask(
    'M6.3 5 5 6.3 8.7 10 5 13.7 6.3 15 10 11.3 13.7 15 15 13.7 11.3 10 15 6.3 13.7 5 10 8.7 6.3 5Z',
  ),
}

const inks = {
  success: ref.success.ink,
  error: ref.error.ink,
  warning: ref.warning.ink,
  info: ref.info.ink,
} as const

/** How far each card behind the front one peeks out, and how much smaller it is. */
const peek = ref.space.xs
const shrink = '0.05'
const gap = ref.space.xs
/** Up for a stack on the bottom edge, down for one on the top. */
const dir = 'var(--_fk-toast-dir, -1)'
const index = 'var(--fk-toast-index, 0)'
/** In the component's list, the cards are stacked; anywhere else they flow. */
const stacked = ':where([data-stack]) > &'
/** Behind a card that stays: not the front one, though a card leaving in front may be first. */
const behind = ':where([data-stack]) > :not([data-leave]) ~ &'
const held = ':where([data-expanded]) > [data-stack] > &'

/** A mark drawn in the text's colour, filling its box. */
const drawn = (url: string) => ({
  content: '""',
  inlineSize: '100%',
  blockSize: '100%',
  background: 'currentColor',
  mask: `${url} center / contain no-repeat`,
  WebkitMask: `${url} center / contain no-repeat`,
})

/** A type's mark in its ink, unless the application drew one in the icon. */
const typed = (type: keyof typeof inks): StyleValue =>
  Style.compose(
    Style.pseudo(`[data-type="${type}"]`, { color: inks[type] }),
    Style.nest(`&[data-type="${type}"]:empty::before`, drawn(marks[type])),
  )

const rich = (type: keyof typeof inks, subtle: string, outline: string): StyleValue =>
  Style.pseudo(`[data-type="${type}"]`, {
    background: `color-mix(in oklab, ${subtle} 70%, ${raisedSurface()})`,
    borderColor: outline,
    color: inks[type],
  })

/**
 * The stack's distance from each screen edge it sits at: past what a notch or the home
 * indicator takes there. Inline edges flip with the direction while the screen's insets do
 * not, so they keep clear of the larger side.
 */
const fromEdge = {
  top: `calc(${ref.space.lg} + ${ref.safe.top})`,
  bottom: `calc(${ref.space.lg} + ${ref.safe.bottom})`,
  inline: `calc(${ref.space.lg} + max(${ref.safe.left}, ${ref.safe.right}))`,
}

/**
 * Where the pointer is coarse, a target a finger can find around a button drawn smaller,
 * reaching `inset` past its edges: the close button's 24px and the action's caption line.
 */
const fingerTarget = (inset: string): StyleValue =>
  Style.at(
    '@media (pointer: coarse)',
    Style.nest('&::after', { content: '""', position: 'absolute', inset }),
  )

export const Toast = Style.recipeFor(ToastSlots)({
  base: {
    container: component(
      Style.self({
        position: 'fixed',
        insetBlockEnd: fromEdge.bottom,
        insetInlineEnd: fromEdge.inline,
        display: 'grid',
        gap: ref.space.sm,
        inlineSize: `min(22rem, calc(100% - 2rem - ${ref.safe.left} - ${ref.safe.right}))`,
        zIndex: '50',
      }),
      Style.pseudo('[data-position^="top"]', {
        insetBlockStart: fromEdge.top,
        insetBlockEnd: 'auto',
        '--_fk-toast-dir': '1',
      }),
      Style.pseudo('[data-position$="-start"]', {
        insetInlineStart: fromEdge.inline,
        insetInlineEnd: 'auto',
      }),
      Style.pseudo('[data-position$="-center"]', { insetInline: '0', marginInline: 'auto' }),
    ),
    // As tall as the front card and the steps behind it, or every card
    // spread out: the box the pointer holds the stack in.
    list: component(
      Style.self({
        position: 'relative',
        margin: '0',
        padding: '0',
        listStyle: 'none',
        blockSize: `calc(var(--fk-toast-front, 0px) + max(var(--fk-toast-count, 1) - 1, 0) * ${peek})`,
        transitionProperty: 'block-size',
        transitionDuration: travelled(ref.motion.fast),
        transitionTimingFunction: ref.motion.ease,
      }),
      Style.nest(':where([data-expanded]) > &', {
        blockSize: `calc(var(--fk-toast-total, 0px) + max(var(--fk-toast-count, 1) - 1, 0) * ${gap})`,
      }),
    ),
    entry: component(
      Style.self({
        display: 'flex',
        alignItems: 'flex-start',
        gap: ref.space.sm,
        boxSizing: 'border-box',
        padding: ref.space.md,
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.lg,
        // Its action takes a corner concentric with the toast's.
        ...nests(ref.radius.lg, ref.space.md, ref.border.thin),
        background: raisedSurface(),
        color: ref.text.default,
        boxShadow: ref.shadow.lg,
        overflow: 'hidden',
      }),
      raise(2),
      // What an application draws as the card's one child fills the card,
      // or a short payload leaves an empty strip at the end.
      Style.nest('& > :only-child', { flex: '1', minInlineSize: '0' }),
      Style.nest(stacked, {
        position: 'absolute',
        insetInline: '0',
        insetBlockEnd: '0',
        zIndex: `calc(100 - ${index})`,
        transformOrigin: 'bottom center',
        translate: `var(--fk-toast-swipe-x) calc(${dir} * ${index} * ${peek} + var(--fk-toast-swipe-y))`,
        scale: `calc(1 - ${index} * ${shrink})`,
        // A restack is short travel: quick, and landing without a wobble.
        transitionProperty: 'translate, scale, opacity, block-size',
        transitionDuration: `${travelled(ref.motion.moderate)}, ${travelled(ref.motion.moderate)}, ${ref.motion.fast}, ${travelled(ref.motion.moderate)}`,
        transitionTimingFunction: `${ref.motion.settle}, ${ref.motion.settle}, ${ref.motion.ease}, ${ref.motion.settle}`,
      }),
      Style.nest(`:where([data-position^="top"]) > [data-stack] > &`, {
        insetBlockEnd: 'auto',
        insetBlockStart: '0',
        transformOrigin: 'top center',
      }),
      // Behind the front one, as tall as it: a taller card would stand out past it.
      Style.nest(behind, { blockSize: 'var(--fk-toast-front)' }),
      Style.nest(held, {
        blockSize: 'auto',
        scale: '1',
        translate: `var(--fk-toast-swipe-x) calc(${dir} * (var(--fk-toast-offset, 0px) + ${index} * ${gap}) + var(--fk-toast-swipe-y))`,
      }),
      // An entrance travels the card's whole height, so it takes the large surface's spring.
      Style.nest(`${stacked}[data-enter]`, {
        transitionDuration: `${travelled(ref.motion.slow)}, ${travelled(ref.motion.slow)}, ${ref.motion.fast}, ${travelled(ref.motion.moderate)}`,
        transitionTimingFunction: `${ref.motion.spring}, ${ref.motion.spring}, ${ref.motion.ease}, ${ref.motion.settle}`,
      }),
      // Leaving, it fades over the card taking its place, a tier quicker than it came.
      Style.nest(`${stacked}[data-leave]`, {
        zIndex: `calc(101 - ${index})`,
        transitionDuration: `${travelled(ref.motion.moderate)}, ${travelled(ref.motion.moderate)}, ${ref.motion['fast-exit']}, ${travelled(ref.motion.moderate)}`,
        transitionTimingFunction: `${ref.motion.settle}, ${ref.motion.settle}, ${ref.motion['ease-exit']}, ${ref.motion.settle}`,
      }),
      // Under the finger, it follows at once.
      Style.nest(`${stacked}[data-swiping]`, { transitionDuration: '0s' }),
      // In from its edge, out by fading, on along its swipe when swiped away.
      Style.nest(`${stacked}[data-enter][data-closed]`, {
        opacity: '0',
        translate: `0 calc(-1 * ${dir} * 100%)`,
      }),
      Style.nest(`${stacked}[data-leave][data-closed]`, { opacity: '0' }),
      Style.nest(`${stacked}[data-swiped="x"][data-closed]`, {
        translate: `calc(var(--fk-toast-swipe-x) * 4) calc(${dir} * ${index} * ${peek})`,
      }),
      Style.nest(`${stacked}[data-swiped="y"][data-closed]`, {
        translate: `0 calc(var(--fk-toast-swipe-y) * 4)`,
      }),
      Style.nest(`${stacked}[data-waiting]`, { opacity: '0', pointerEvents: 'none' }),
      // A card's words are seen once it stands in front, or the stack spreads.
      Style.nest(`${behind} > *`, {
        opacity: '0',
        transition: `opacity ${ref.motion.fast}`,
      }),
      Style.nest(`${held} > *`, { opacity: '1' }),
    ),
    icon: component(
      Style.self({
        display: 'inline-flex',
        flex: 'none',
        inlineSize: '1.25rem',
        blockSize: '1.25rem',
        marginBlockStart: '0.0625rem',
      }),
      typed('success'),
      typed('error'),
      typed('warning'),
      typed('info'),
      Style.nest('&[data-type="loading"]:empty::before', {
        content: '""',
        inlineSize: '100%',
        blockSize: '100%',
        boxSizing: 'border-box',
        border: `${ref.border.thick} solid color-mix(in oklab, currentColor 20%, transparent)`,
        borderInlineStartColor: 'currentColor',
        borderRadius: ref.radius.full,
      }),
      // Still under reduced motion, as every loading ring is: a breath in its
      // place ran for the reset's 0.01ms too, and flickered.
      turning(`calc(${ref.motion.slow} * 3)`, '&[data-type="loading"]:empty::before'),
    ),
    body: component(
      Style.self({
        display: 'grid',
        flex: '1',
        minInlineSize: '0',
        gap: ref.space['3xs'],
        // A swipe starts here: the page does not scroll along its axis.
        touchAction: 'none',
        // No callout of iOS's own for a press held while dragging.
        WebkitTouchCallout: 'none',
        userSelect: 'none',
      }),
    ),
    title: component(
      Style.self({ ...role('body'), fontWeight: ref.weight.semibold, color: 'inherit' }),
    ),
    description: component(
      Style.self({
        ...role('caption'),
        color: `color-mix(in oklab, currentColor 72%, transparent)`,
      }),
    ),
    action: component(
      Style.self({
        flex: 'none',
        alignSelf: 'center',
        paddingBlock: ref.space['2xs'],
        paddingInline: ref.space.sm,
        border: '0',
        borderRadius: ref.radius.md,
        background: ref.text.default,
        color: ref.surface.base,
        font: 'inherit',
        ...role('caption'),
        fontWeight: ref.weight.medium,
        cursor: 'pointer',
        position: 'relative',
      }),
      fingerTarget('-10px -4px'),
      focusRing,
    ),
    close: component(
      Style.self({
        display: 'inline-grid',
        flex: 'none',
        inlineSize: '1.5rem',
        blockSize: '1.5rem',
        padding: ref.space['2xs'],
        border: '0',
        borderRadius: ref.radius.md,
        background: 'transparent',
        color: ref.text.muted,
        cursor: 'pointer',
        position: 'relative',
      }),
      Style.nest('&::before', drawn(marks.close)),
      fingerTarget('-10px'),
      hover({ background: unfilledHover, color: ref.text.default }),
      focusRing,
    ),
    status: component(Style.self({})),
    alert: component(Style.self({})),
  },
  variants: {
    tone: {
      plain: {},
      rich: {
        entry: variant(
          rich('success', ref.success.subtle, ref.success.outline),
          rich('error', ref.error.subtle, ref.error.outline),
          rich('warning', ref.warning.subtle, ref.warning.outline),
          rich('info', ref.info.subtle, ref.info.outline),
        ),
      },
    },
  },
  defaults: { tone: 'plain' },
})

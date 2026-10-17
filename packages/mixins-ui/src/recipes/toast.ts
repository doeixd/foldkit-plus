/**
 * A toast stack after Sonner: cards at a corner or the middle of an edge,
 * the newest in front. Collapsed, the ones behind peek out a step under the
 * front one, each smaller and clipped to its height; held (`data-expanded`)
 * they spread out, each above the last at its measured height
 * (`Toast.Stack`'s properties). A card enters from its edge and fades out
 * as it leaves, carrying on the way it was swiped; each movement travels,
 * so reduced motion keeps only the fades. The icon draws its type's mark in
 * the type's ink, a turning ring for `loading`; `tone: 'rich'` tints the
 * whole card in its type, as Sonner's `richColors`. A card drawn outside
 * the component's list (the fork's) lays out in a plain column.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { raise, raisedSurface, role } from 'foldkit-mixins/theme'
import { ToastSlots } from '../toast.js'
import { component, focusRing, hover, ref, travelled, unfilledHover, variant } from './design.js'

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

const spin = Style.keyframes({ to: { rotate: '360deg' } })
const breathe = Style.keyframes({ '50%': { opacity: '0.4' } })

/** How far each card behind the front one peeks out, and how much smaller it is. */
const peek = ref.space.xs
const shrink = '0.05'
const gap = ref.space.xs
/** Up for a stack on the bottom edge, down for one on the top. */
const dir = 'var(--_fk-toast-dir, -1)'
const index = 'var(--fk-toast-index, 0)'
/** In the component's list, the cards are stacked; anywhere else they flow. */
const stacked = ':where([data-stack]) > &'
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

export const Toast = Style.recipeFor(ToastSlots)({
  base: {
    container: component(
      Style.self({
        position: 'fixed',
        insetBlockEnd: ref.space.lg,
        insetInlineEnd: ref.space.lg,
        display: 'grid',
        gap: ref.space.sm,
        inlineSize: 'min(22rem, calc(100vw - 2rem))',
        zIndex: '50',
      }),
      Style.pseudo('[data-position^="top"]', {
        insetBlockStart: ref.space.lg,
        insetBlockEnd: 'auto',
        '--_fk-toast-dir': '1',
      }),
      Style.pseudo('[data-position$="-start"]', {
        insetInlineStart: ref.space.lg,
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
        background: raisedSurface(),
        color: ref.text.default,
        boxShadow: ref.shadow.lg,
        overflow: 'hidden',
      }),
      raise(2),
      Style.nest(stacked, {
        position: 'absolute',
        insetInline: '0',
        insetBlockEnd: '0',
        zIndex: `calc(100 - ${index})`,
        transformOrigin: 'bottom center',
        translate: `var(--fk-toast-swipe-x) calc(${dir} * ${index} * ${peek} + var(--fk-toast-swipe-y))`,
        scale: `calc(1 - ${index} * ${shrink})`,
        transitionProperty: 'translate, scale, opacity, block-size',
        transitionDuration: `${travelled(ref.motion.slow)}, ${travelled(ref.motion.slow)}, ${ref.motion.fast}, ${travelled(ref.motion.slow)}`,
        transitionTimingFunction: ref.motion.ease,
      }),
      Style.nest(`:where([data-position^="top"]) > [data-stack] > &`, {
        insetBlockEnd: 'auto',
        insetBlockStart: '0',
        transformOrigin: 'top center',
      }),
      // Behind the front one, as tall as it: a taller card would stand out past it.
      Style.nest(`:where([data-stack]) > &:not(:first-child)`, {
        blockSize: 'var(--fk-toast-front)',
      }),
      Style.nest(held, {
        blockSize: 'auto',
        scale: '1',
        translate: `var(--fk-toast-swipe-x) calc(${dir} * (var(--fk-toast-offset, 0px) + ${index} * ${gap}) + var(--fk-toast-swipe-y))`,
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
      Style.nest(`:where([data-stack]) > &:not(:first-child) > *`, {
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
        animation: `${spin.name} ${travelled(`calc(${ref.motion.slow} * 3)`)} linear infinite`,
      }),
      spin.style,
      breathe.style,
      // A wheel that cannot turn still says work is going on.
      Style.at(
        '@media (prefers-reduced-motion: reduce)',
        Style.nest('&[data-type="loading"]:empty::before', {
          animation: `${breathe.name} calc(${ref.motion.slow} * 6) ease-in-out infinite`,
        }),
      ),
    ),
    body: component(
      Style.self({
        display: 'grid',
        flex: '1',
        minInlineSize: '0',
        gap: ref.space['3xs'],
        // A swipe starts here: the page does not scroll along its axis.
        touchAction: 'none',
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
      }),
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
      }),
      Style.nest('&::before', drawn(marks.close)),
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

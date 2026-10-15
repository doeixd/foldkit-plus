/**
 * Carousel: a track that snaps one slide at a time, rounded and clipped,
 * with no scrollbar (the buttons, dots and a swipe move it), and a row below
 * of round previous and next buttons around the dots. The chevrons are drawn
 * in CSS and point the other way right to left, where the track runs the
 * other way. The current dot widens to a pill in the accent. The track
 * scrolls smoothly only when the reader has not asked for reduced motion.
 *
 * `peek: 'edge'` narrows each slide so the next shows at the edge, a hint
 * that there is more; `peek: 'none'` gives each the track's whole width.
 */
import { Style } from 'foldkit-mixins'
import { ladder } from 'foldkit-mixins/theme'
import { Utilities } from 'foldkit-mixins/utilities'
import { CarouselSlots } from '../carousel.js'
import {
  component,
  cornerSides,
  disabled,
  focusRing,
  hover,
  ref,
  transition,
  travelled,
  unfilledHover,
  variant,
} from './design.js'

// The chevron's point is off its box's center, so `nudge` sets it back on the button's.
const chevron = (turn: string, nudge: string) =>
  Style.nest('&::before', {
    content: '""',
    inlineSize: '0.45rem',
    blockSize: '0.45rem',
    ...cornerSides(ref.border.thick, 'currentColor'),
    rotate: turn,
    translate: nudge,
  })

const arrow = (turn: string, nudge: string) =>
  component(
    Style.self({
      display: 'grid',
      placeItems: 'center',
      flexShrink: '0',
      inlineSize: ladder('height'),
      blockSize: ladder('height'),
      padding: '0',
      border: `${ref.border.thin} solid ${ref.outline.default}`,
      borderRadius: ref.radius.full,
      background: ref.surface.base,
      color: ref.text.default,
      cursor: 'pointer',
      ...transition('background-color, opacity'),
    }),
    chevron(turn, nudge),
    Style.pseudo(':dir(rtl)', { scale: '-1 1' }),
    hover({ background: unfilledHover }),
    focusRing,
    disabled,
  )

export const Carousel = Style.recipeFor(CarouselSlots)({
  base: {
    root: component(Style.self({ display: 'grid', gap: ref.space.sm, minInlineSize: '0' })),
    track: component(
      Style.self({
        display: 'flex',
        gap: ref.space.sm,
        overflowX: 'auto',
        overscrollBehaviorX: 'contain',
        scrollSnapType: 'x mandatory',
        scrollbarWidth: 'none',
        borderRadius: ref.radius.lg,
      }),
      Style.nest('&::-webkit-scrollbar', { display: 'none' }),
      Style.media('(prefers-reduced-motion: no-preference)', { scrollBehavior: 'smooth' }),
      focusRing,
    ),
    slide: component(
      Style.self({
        flex: '0 0 var(--_fk-carousel-basis, 100%)',
        minInlineSize: '0',
        scrollSnapAlign: 'start',
        // One slide per swipe, however hard it is flung.
        scrollSnapStop: 'always',
        borderRadius: ref.radius.lg,
        overflow: 'hidden',
      }),
    ),
    controls: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: ref.space.sm,
      }),
    ),
    previous: arrow('135deg', '15% 0'),
    next: arrow('-45deg', '-15% 0'),
    picker: component(Style.self({ display: 'flex', alignItems: 'center' })),
    // A dot drawn small inside a button big enough to press.
    dot: component(
      Style.self({
        display: 'grid',
        placeItems: 'center',
        minInlineSize: '1.5rem',
        blockSize: '1.5rem',
        padding: '0',
        border: '0',
        borderRadius: ref.radius.full,
        background: 'transparent',
        cursor: 'pointer',
      }),
      Style.nest('&::before', {
        content: '""',
        inlineSize: '0.5rem',
        blockSize: '0.5rem',
        borderRadius: ref.radius.full,
        background: ref.outline.default,
        transitionProperty: 'background-color, inline-size',
        transitionDuration: `${ref.motion.fast}, ${travelled(ref.motion.fast)}`,
        transitionTimingFunction: ref.motion.ease,
      }),
      Style.nest('&:hover::before', { background: ref.text.muted }),
      Style.nest('&[aria-current="true"]::before', {
        inlineSize: '1.25rem',
        background: ref.accent.default,
      }),
      Style.pseudo('[aria-current="true"]', { cursor: 'default' }),
      focusRing,
    ),
    status: component(Utilities.srOnly),
  },
  variants: {
    peek: {
      none: {},
      edge: {
        track: variant(Style.self({ '--_fk-carousel-basis': '85%' })),
      },
    },
  },
  defaults: { peek: 'none' },
})

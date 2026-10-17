/**
 * Carousel: a track that snaps one slide at a time, rounded and clipped,
 * with no scrollbar (the buttons, dots and a swipe move it), and a row below
 * of round previous and next buttons around the dots. The chevrons are drawn
 * in CSS and point the other way right to left, where the track runs the
 * other way. The current dot widens to a pill in the accent, Fluid
 * Functionalism's, and while the carousel rotates the pill fills over the
 * delay, holding still while a pointer pauses it. The rotation button sits
 * over the track's end corner, a pause mark while rotating and a play mark
 * while stopped. Thumbnails sit in a row that scrolls, the current one ringed
 * in the accent. The track scrolls smoothly, and the pill fills, only when
 * the reader has not asked for reduced motion (still, it shows full).
 *
 * The root's `--fk-carousel-per-view` (the view's `perView`) sets how many
 * slides share the track. `peek: 'edge'` narrows them so the next shows at
 * the edge, a hint that there is more; `peek: 'none'` gives them the
 * track's whole width.
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

const gap = ref.space.sm
const perView = 'var(--fk-carousel-per-view, 1)'

// One fill under two names: a wait begun anew switches the name, which runs
// the fill again from empty.
const fills = [
  Style.keyframes({ from: { backgroundSize: '0% 100%' }, to: { backgroundSize: '100% 100%' } }),
  Style.keyframes({ '0%': { backgroundSize: '0% 100%' }, '100%': { backgroundSize: '100% 100%' } }),
] as const

const filling = (turn: 'even' | 'odd', name: string) =>
  Style.nest(
    `:where([data-rotation="rotating"], [data-rotation="paused"]) &[aria-current="true"][data-turn="${turn}"]::before`,
    {
      backgroundColor: ref.outline.default,
      backgroundImage: `linear-gradient(${ref.accent.default}, ${ref.accent.default})`,
      backgroundRepeat: 'no-repeat',
      // Longhands, so the paused rule's play state is not reset by a shorthand.
      animationName: name,
      animationDuration: travelled('var(--fk-carousel-delay, 4s)'),
      animationTimingFunction: 'linear',
      animationFillMode: 'both',
    },
  )

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
    root: component(
      Style.self({ position: 'relative', display: 'grid', gap: ref.space.sm, minInlineSize: '0' }),
    ),
    // Over the track's end corner: first in the tab order, out of the slides' way.
    rotation: component(
      Style.self({
        position: 'absolute',
        insetBlockStart: ref.space.xs,
        insetInlineEnd: ref.space.xs,
        zIndex: '1',
        display: 'grid',
        placeItems: 'center',
        inlineSize: ladder('height'),
        blockSize: ladder('height'),
        padding: '0',
        border: '0',
        borderRadius: ref.radius.full,
        background: `color-mix(in oklab, ${ref.surface.base} 85%, transparent)`,
        color: ref.text.default,
        cursor: 'pointer',
        ...transition('background-color'),
      }),
      // Pause: two bars.
      Style.nest('&::before', {
        content: '""',
        inlineSize: '0.55rem',
        blockSize: '0.65rem',
        borderInline: '0.18rem solid currentColor',
      }),
      // Play: a triangle pointing along the track, the other way right to left.
      Style.nest('&[data-state="stopped"]::before', {
        inlineSize: '0.6rem',
        borderInline: '0',
        background: 'currentColor',
        clipPath: 'polygon(10% 0, 100% 50%, 10% 100%)',
      }),
      Style.nest('&[data-state="stopped"]:dir(rtl)::before', {
        clipPath: 'polygon(90% 0, 0 50%, 90% 100%)',
      }),
      hover({ background: ref.surface.base }),
      focusRing,
    ),
    track: component(
      Style.self({
        display: 'flex',
        gap,
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
        // The span shared by `perView` slides and the gaps between them.
        flex: `0 0 calc((var(--_fk-carousel-span, 100%) - (${perView} - 1) * ${gap}) / ${perView})`,
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
    // Thumbnails past the room scroll with no bar, as the track does.
    picker: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ref.space['2xs'],
        minInlineSize: '0',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        // Room for the current thumbnail's ring, which the scroll would clip.
        padding: ref.space['2xs'],
      }),
      Style.nest('&::-webkit-scrollbar', { display: 'none' }),
    ),
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
        inlineSize: '1.5rem',
        background: ref.accent.default,
      }),
      filling('even', fills[0].name),
      filling('odd', fills[1].name),
      fills[0].style,
      fills[1].style,
      Style.nest(':where([data-rotation="paused"]) &::before', { animationPlayState: 'paused' }),
      Style.nest('&:dir(rtl)::before', { backgroundPosition: 'right' }),
      Style.pseudo('[aria-current="true"]', { cursor: 'default' }),
      focusRing,
    ),
    thumbnail: component(
      Style.self({
        flex: '0 0 auto',
        inlineSize: '4rem',
        aspectRatio: '4 / 3',
        padding: '0',
        border: '0',
        borderRadius: ref.radius.md,
        overflow: 'hidden',
        background: ref.surface.muted,
        opacity: '0.6',
        cursor: 'pointer',
        ...transition('opacity, box-shadow'),
      }),
      Style.nest('& > *', { inlineSize: '100%', blockSize: '100%', objectFit: 'cover' }),
      hover({ opacity: '0.85' }),
      Style.pseudo('[aria-current="true"]', {
        opacity: '1',
        boxShadow: `0 0 0 ${ref.border.thick} ${ref.accent.default}`,
        cursor: 'default',
      }),
      focusRing,
    ),
    status: component(Utilities.srOnly),
  },
  variants: {
    peek: {
      none: {},
      edge: {
        track: variant(Style.self({ '--_fk-carousel-span': '85%' })),
      },
    },
  },
  defaults: { peek: 'none' },
})

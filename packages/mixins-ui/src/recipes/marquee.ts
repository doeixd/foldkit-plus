/**
 * Marquee: copies of the content side by side (or stacked, `top` and
 * `bottom`, 16rem tall or no taller than a container with a height), each
 * sliding by its own length and starting again, at the duration the view
 * measured, times the `motion` knob. The distance travels,
 * so a still theme or reduced motion holds it; under reduced motion the
 * viewport scrolls instead and one copy shows. The ends fade out by a mask
 * (`edges: 'fade'`), so it reads on any ground. A pointer over it, focus
 * inside it, or its pause press holds it. The pause press is a small round
 * button at the end corner, shown while the marquee is pointed at, focused
 * or paused, and always where nothing hovers. `spacing` is the gap between
 * items, the same between the last of one copy and the first of the next.
 */
import { Style } from 'foldkit-mixins'
import { ladder } from 'foldkit-mixins/theme'
import { MarqueeSlots } from '../marquee.js'
import { component, focusRing, ref, transition, variant } from './design.js'

const gap = 'var(--_fk-marquee-gap)'
const fade = 'var(--_fk-marquee-fade)'
// Each copy moves its own length, toward the start: leftward, or rightward right to left.
const along = (axis: 'x' | 'y') =>
  Style.keyframes({
    from: { translate: '0 0' },
    to: {
      translate:
        axis === 'x'
          ? `calc(var(--_fk-marquee-way) * -100% * ${ref.knob.travel}) 0`
          : `0 calc(-100% * ${ref.knob.travel})`,
    },
  })
const across = along('x')
const down = along('y')

// No fill: a round that ends, or one of no duration (the motion knob at 0), shows the first
// copy where it starts, which looks the same as where it ends but is the copy the keys reach.
const timing = `calc(var(--fk-marquee-duration, 20s) * ${ref.knob.motion}) linear var(--fk-marquee-delay, 0s) var(--fk-marquee-loop-count, infinite)`

const held = ':is([data-paused], [data-pause-on-interaction]:is(:hover, :focus-within))'
const shownPress = ':is(:hover, :focus-within, [data-paused])'

const spaced = (length: string) => variant(Style.self({ '--_fk-marquee-gap': length }))

// At most a quarter at each end, so a short viewport keeps a middle in full.
const fadeIn = `min(${fade}, 25%)`
const mask = (to: string) =>
  `linear-gradient(${to}, transparent, #000 ${fadeIn}, #000 calc(100% - ${fadeIn}), transparent)`

export const Marquee = Style.recipeFor(MarqueeSlots)({
  base: {
    root: component(
      Style.self({
        position: 'relative',
        minInlineSize: '0',
        '--_fk-marquee-gap': ref.space.lg,
        '--_fk-marquee-fade': '0px',
        '--_fk-marquee-way': '1',
      }),
      Style.pseudo(':dir(rtl)', { '--_fk-marquee-way': '-1' }),
      // Stacked, it needs a height to scroll within: its own, or no more than its container's.
      Style.pseudo('[data-orientation="vertical"]', { blockSize: '16rem', maxBlockSize: '100%' }),
    ),
    viewport: component(
      Style.self({ display: 'flex', overflow: 'hidden', blockSize: '100%' }),
      Style.nest('[data-orientation="vertical"] > &', {
        flexDirection: 'column',
        maskImage: mask('to bottom'),
      }),
      Style.nest('[data-orientation="horizontal"] > &', { maskImage: mask('to right') }),
      Style.media('(prefers-reduced-motion: reduce)', { overflow: 'auto' }),
    ),
    content: component(
      Style.self({
        display: 'flex',
        flex: 'none',
        alignItems: 'center',
        gap,
        animation: `${across.name} ${timing}`,
      }),
      across.style,
      down.style,
      // A last flex item of no size: the gap before it spaces this copy from the next.
      Style.pseudo('::after', { content: '""', flex: 'none' }),
      Style.nest('[data-orientation="vertical"] > * > &', {
        flexDirection: 'column',
        animationName: down.name,
      }),
      Style.nest(':is([data-side="end"], [data-side="bottom"]) > * > &', {
        animationDirection: 'reverse',
      }),
      Style.nest(`${held} > * > &`, { animationPlayState: 'paused' }),
      Style.media('(prefers-reduced-motion: reduce)', { animation: 'none' }),
      // Still, the viewport scrolls over the one copy, so the content stays reachable.
      Style.at(
        '@media (prefers-reduced-motion: reduce)',
        Style.pseudo('[data-clone]', { display: 'none' }),
      ),
    ),
    item: component(Style.self({ flex: 'none' })),
    pause: component(
      Style.self({
        position: 'absolute',
        insetInlineEnd: ref.space['2xs'],
        insetBlockEnd: ref.space['2xs'],
        display: 'grid',
        placeItems: 'center',
        inlineSize: ladder('height'),
        blockSize: ladder('height'),
        padding: '0',
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.full,
        background: ref.surface.base,
        color: ref.text.default,
        boxShadow: ref.shadow.sm,
        cursor: 'pointer',
        opacity: '0',
        ...transition('opacity'),
      }),
      Style.nest(`${shownPress} > &`, { opacity: '1' }),
      Style.media('(hover: none)', { opacity: '1' }),
      // Two bars while it moves, a triangle while it is held.
      Style.pseudo('::before', {
        content: '""',
        inlineSize: `calc(${ladder('icon')} * 0.75)`,
        blockSize: `calc(${ladder('icon')} * 0.75)`,
        background: 'currentColor',
        clipPath:
          'polygon(0 0, 35% 0, 35% 100%, 0 100%, 0 0, 65% 0, 100% 0, 100% 100%, 65% 100%, 65% 0)',
      }),
      Style.pseudo('[data-paused="true"]::before', {
        clipPath: 'polygon(10% 0, 100% 50%, 10% 100%)',
      }),
      focusRing,
    ),
  },
  variants: {
    spacing: {
      sm: { root: spaced(ref.space.sm) },
      md: { root: spaced(ref.space.lg) },
      lg: { root: spaced(ref.space['2xl']) },
    },
    edges: {
      none: {},
      fade: { root: variant(Style.self({ '--_fk-marquee-fade': ref.space['2xl'] })) },
    },
  },
  defaults: { edges: 'fade' },
})

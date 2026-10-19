/**
 * A loading bar and the shapes made of them. A bar is a film of the text
 * over its ground, so it reads on a light page and a dark one alike (the
 * muted surface step sat a hair under a dark page and all but vanished).
 * `animation` breathes it (`pulse`), sweeps a band of the page across it
 * (`shimmer`, the other way right to left) or holds it (`none`); reduced
 * motion stills both, and the sweep's duration is a travel's, so a still
 * theme stills it too. `shape` is a lone bar's; the shapes in a frame are
 * its own: a circle, a picture, lines that end early.
 */
import { Style } from 'foldkit-mixins'
import { SkeletonSlots } from '../skeleton.js'
import { component, ref, travelled, variant } from './design.js'

const pulse = Style.keyframes({
  from: { opacity: '1' },
  '50%': { opacity: '0.45' },
  to: { opacity: '1' },
})

// From past the inline start to past the end: the band is half the gradient's width.
const sweep = Style.keyframes({
  from: { backgroundPosition: '150% 0' },
  to: { backgroundPosition: '-50% 0' },
})

// The palette's muted step, so the bones follow its tint, contrast and scheme.
const fill = ref.surface.muted
const band = `color-mix(in oklab, ${ref.surface.base} 60%, transparent)`
/** A bar on its own: a frame lays out its own bars, whatever shape the lone one takes. */
const lone = '&:not([aria-hidden="true"])'
const still = Style.media('(prefers-reduced-motion: reduce)', { animation: 'none' })

export const Skeleton = Style.recipeFor(SkeletonSlots)({
  base: {
    bar: component(
      Style.self({ background: fill, borderRadius: ref.radius.sm }),
      Style.nest('&[data-shape="circle"]', {
        inlineSize: '2.5rem',
        blockSize: '2.5rem',
        borderRadius: ref.radius.full,
      }),
      Style.nest('&[data-shape="block"]', {
        inlineSize: '100%',
        aspectRatio: '16 / 9',
        blockSize: 'auto',
        borderRadius: ref.radius.md,
      }),
    ),
    group: component(
      Style.self({ display: 'grid', gap: ref.space.xs, minInlineSize: '8rem' }),
      // A line in a frame: as tall as a line of body text's ink, filling its column.
      Style.nest('& > :not([data-shape])', { inlineSize: '100%', blockSize: '0.75rem' }),
      Style.nest('& > [data-short]', { inlineSize: '60%' }),
      Style.nest('&[data-kind="avatar-row"]', {
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        columnGap: ref.space.sm,
        alignItems: 'center',
      }),
      Style.nest('&[data-kind="avatar-row"] > [data-shape="circle"]', { gridRow: 'span 2' }),
      Style.nest('&[data-kind="card"]', { gap: ref.space.sm }),
      Style.nest('&[data-kind="table-row"]', {
        gridTemplateColumns: 'repeat(var(--fk-skeleton-columns), minmax(0, 1fr))',
        columnGap: ref.space.md,
        paddingBlock: ref.space.xs,
      }),
    ),
  },
  variants: {
    shape: {
      bar: {
        bar: variant(
          // A floor, since a container that sizes to its content (a centered
          // column, a flex item) gives `100%` nothing and the bar vanished.
          Style.nest(lone, { inlineSize: '100%', minInlineSize: '4rem', blockSize: '1rem' }),
        ),
      },
      circle: {
        bar: variant(
          Style.nest(lone, {
            inlineSize: '2.5rem',
            blockSize: '2.5rem',
            borderRadius: ref.radius.full,
          }),
        ),
      },
    },
    animation: {
      pulse: {
        bar: variant(
          Style.self({ animation: `${pulse.name} ${ref.motion.slow} ease-in-out infinite` }),
          pulse.style,
          still,
        ),
      },
      shimmer: {
        bar: variant(
          Style.self({
            backgroundImage: `linear-gradient(90deg, transparent 25%, ${band} 50%, transparent 75%)`,
            backgroundSize: '200% 100%',
            backgroundRepeat: 'no-repeat',
            // About a second and a half at the default motion; a still theme holds it.
            animation: `${sweep.name} ${travelled(`calc(${ref.motion.slow} * 6)`)} linear infinite`,
          }),
          sweep.style,
          Style.nest('&:dir(rtl)', { animationDirection: 'reverse' }),
          still,
        ),
      },
      none: {},
    },
  },
  defaults: { shape: 'bar', animation: 'pulse' },
})

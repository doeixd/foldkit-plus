/**
 * A loading bar: the muted surface breathing through opacity, still under
 * reduced motion. The pulse is a deterministic keyframe the bar references;
 * `prefers-reduced-motion` holds the bar at its resting opacity instead.
 */
import { Style } from 'foldkit-mixins'
import { SkeletonSlots } from '../skeleton.js'
import { component, ref, variant } from './design.js'

const pulse = Style.keyframes({
  from: { opacity: '1' },
  '50%': { opacity: '0.45' },
  to: { opacity: '1' },
})

export const Skeleton = Style.recipeFor(SkeletonSlots)({
  base: {
    bar: component(
      Style.self({
        background: ref.surface.muted,
        animation: `${pulse.name} ${ref.motion.normal} ease-in-out infinite`,
      }),
      pulse.style,
      Style.media('(prefers-reduced-motion: reduce)', { animation: 'none' }),
    ),
  },
  variants: {
    shape: {
      bar: {
        bar: variant(
          Style.self({ inlineSize: '100%', blockSize: '1rem', borderRadius: ref.radius.sm }),
        ),
      },
      circle: {
        bar: variant(
          Style.self({ inlineSize: '2.5rem', blockSize: '2.5rem', borderRadius: ref.radius.full }),
        ),
      },
    },
  },
  defaults: { shape: 'bar' },
})

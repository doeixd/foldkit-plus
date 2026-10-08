/**
 * A loading wheel: a bordered ring spinning through a keyframed rotation,
 * still under reduced motion. The wheel is border segments rather than a
 * masked disc, so it draws in one element with no pseudo-element picture.
 */
import { Style } from 'foldkit-mixins'
import { SpinnerSlots } from '../spinner.js'
import { component, ref, variant } from './design.js'

const spin = Style.keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
})

export const Spinner = Style.recipeFor(SpinnerSlots)({
  base: {
    wheel: component(
      Style.self({
        borderRadius: ref.radius.full,
        border: `${ref.border.thick} solid ${ref.outline.subtle}`,
        borderTopColor: ref.accent.default,
        animation: `${spin.name} ${ref.motion.normal} linear infinite`,
      }),
      spin.style,
      Style.media('(prefers-reduced-motion: reduce)', { animation: 'none' }),
    ),
  },
  variants: {
    size: {
      md: {
        wheel: variant(Style.self({ inlineSize: '1.5rem', blockSize: '1.5rem' })),
      },
      sm: {
        wheel: variant(Style.self({ inlineSize: '1rem', blockSize: '1rem' })),
      },
    },
  },
  defaults: { size: 'md' },
})

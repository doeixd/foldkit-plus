/**
 * A meter: a rounded track whose fill, sized by upstream, takes the colour
 * of how good the value is (`data-level` on the root): success, warning or
 * error, as a battery or a disk gauge reads.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { MeterSlots } from '../meter.js'
import { component, ref, travelled } from './design.js'

const level = (name: 'good' | 'fair' | 'poor') => `:where([data-level="${name}"]) &`

export const Meter = Style.recipeFor(MeterSlots)({
  base: {
    root: component(Style.self({ display: 'grid', gap: ref.space['2xs'], inlineSize: 'min(20rem, 100%)' })),
    label: component(Style.self({ ...role('caption'), color: ref.text.muted })),
    track: component(
      Style.self({
        blockSize: '0.5rem',
        overflow: 'hidden',
        borderRadius: ref.radius.full,
        background: ref.outline.subtle,
      }),
    ),
    fill: component(
      Style.self({
        blockSize: '100%',
        borderRadius: ref.radius.full,
        transitionProperty: 'width, background-color',
        transitionDuration: `${travelled(ref.motion.moderate)}, ${ref.motion.fast}`,
        transitionTimingFunction: `${ref.motion.settle}, ${ref.motion.ease}`,
      }),
      Style.nest(level('good'), { background: ref.success.default }),
      Style.nest(level('fair'), { background: ref.warning.default }),
      Style.nest(level('poor'), { background: ref.error.default }),
    ),
  },
})

/**
 * A meter: a rounded track whose fill, sized by upstream, takes the colour
 * of how good the value is (`data-level` on the root): success, warning or
 * error, as a battery or a disk gauge reads. A vertical one (`data-orientation`
 * on the root, from the view's `orientation`) stands the track upright and
 * grows the fill from its block end; a segmented one (`data-segmented`, from
 * `segments`) is cut into equal steps by a mask. `size` is the track's
 * thickness in either direction.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { MeterSlots } from '../meter.js'
import { component, ref, travelled, variant } from './design.js'

const level = (name: 'good' | 'fair' | 'poor') => `:where([data-level="${name}"]) &`
const vertical = ':where([data-orientation="vertical"]) &'
const verticalTrack = ':where([data-orientation="vertical"]) > &'
const segmented = ':where([data-segmented]) > &'

const thick = 'var(--_fk-meter-thick, 0.5rem)'
const gap = 'var(--_fk-meter-gap, 0.125rem)'
const step = `calc((100% + ${gap}) / var(--fk-meter-segments))`
const cut = (toward: string) =>
  `repeating-linear-gradient(${toward}, black 0 calc(${step} - ${gap}), transparent 0 ${step})`

const sized = (size: string) => ({ root: variant(Style.self({ '--_fk-meter-thick': size })) })

export const Meter = Style.recipeFor(MeterSlots)({
  base: {
    root: component(
      Style.self({ display: 'grid', gap: ref.space['2xs'], inlineSize: 'min(20rem, 100%)' }),
      Style.nest('&[data-orientation="vertical"]', {
        inlineSize: 'fit-content',
        justifyItems: 'start',
      }),
    ),
    label: component(Style.self({ ...role('caption'), color: ref.text.muted })),
    track: component(
      Style.self({
        blockSize: thick,
        overflow: 'hidden',
        borderRadius: ref.radius.full,
        background: ref.outline.subtle,
      }),
      // Upright: as long as the root says (`--fk-meter-length`), the fill resting on its end.
      Style.nest(verticalTrack, {
        inlineSize: thick,
        blockSize: 'var(--fk-meter-length, 8rem)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }),
      Style.nest(segmented, { mask: cut('to right') }),
      Style.nest(`:where([data-orientation="vertical"][data-segmented]) > &`, {
        mask: cut('to top'),
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
      // Upstream's inline `width` is the share; upright, the share is the block size, and the
      // width floor keeps the fill as wide as the track whatever that inline width says.
      Style.nest(vertical, {
        blockSize: 'var(--fk-meter-share, 100%)',
        minInlineSize: '100%',
        transitionProperty: 'block-size, background-color',
      }),
      // A step's end would round inside the mask's gap.
      Style.nest(':where([data-segmented]) > * > &', { borderRadius: '0' }),
      Style.nest(level('good'), { background: ref.success.default }),
      Style.nest(level('fair'), { background: ref.warning.default }),
      Style.nest(level('poor'), { background: ref.error.default }),
    ),
  },
  variants: {
    size: {
      sm: sized('0.25rem'),
      md: {},
      lg: sized('0.75rem'),
    },
  },
  defaults: { size: 'md' },
})

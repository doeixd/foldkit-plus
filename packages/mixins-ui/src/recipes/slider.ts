/**
 * A slider: a bar that fills to the value with a thumb at its end. The fill
 * and thumb read the tone; `size` is the thumb's edge, which the bar and
 * the travel scale from. The value lives in the parent Model, so the look
 * needs no input condition.
 */
import { Style } from 'foldkit-mixins'
import { SliderSlots } from '../slider.js'
import {
  component,
  disabled,
  focusRing,
  ref,
  tones,
  toneVar,
  transition,
  variant,
} from './design.js'

/**
 * The thumb's edge length; the bar reads it too, so sizes set it on the
 * root it inherits from — never on the thumb, whose sibling the bar is.
 */
const box = (length: string) => variant(Style.self({ '--_fk-slider-size': length }))

const sizes = {
  sm: box('0.75rem'),
  md: box('1rem'),
  lg: box('1.25rem'),
} as const

const edge = 'var(--_fk-slider-size)'

export const Slider = Style.recipeFor(SliderSlots)({
  base: {
    root: component(Style.self({ display: 'grid', gap: ref.space['2xs'] })),
    track: component(
      Style.self({
        position: 'relative',
        blockSize: `calc(${edge} * 0.375)`,
        borderRadius: ref.radius.full,
        background: ref.surface.muted,
      }),
    ),
    filledTrack: component(
      Style.self({
        position: 'absolute',
        insetBlock: '0',
        insetInlineStart: '0',
        borderRadius: ref.radius.full,
        background: toneVar('fill'),
      }),
    ),
    thumb: component(
      Style.self({
        position: 'absolute',
        insetBlockStart: '50%',
        blockSize: edge,
        inlineSize: edge,
        borderRadius: ref.radius.full,
        background: ref.surface.base,
        border: `${ref.border.thick} solid ${toneVar('fill')}`,
        translate: '-50% -50%',
        cursor: 'pointer',
        ...transition('background-color, border-color'),
      }),
      focusRing,
      disabled,
    ),
    label: component(
      Style.self({ margin: '0', color: ref.text.overt, fontSize: ref.size.sm, fontWeight: ref.weight.medium }),
    ),
  },
  variants: {
    tone: {
      accent: { root: tones.accent },
      neutral: { root: tones.ink },
    },
    size: {
      sm: { root: sizes.sm },
      md: { root: sizes.md },
      lg: { root: sizes.lg },
    },
  },
  defaults: { tone: 'accent', size: 'md' },
})

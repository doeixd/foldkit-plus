/**
 * A range slider in the Slider's look: the same bar, a fill between the
 * thumbs that reads the tone, and the same ringed thumbs, on the same
 * `tone` and `size` axes. Each thumb is a native range input with its own
 * look removed; only its thumb takes the pointer, so the one underneath
 * stays reachable where the inputs overlap.
 */
import { Style, type Declarations, type StyleValue } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { RangeSliderSlots } from '../rangeSlider.js'
import { component, disabled, ref, tones, toneVar, transition, variant } from './design.js'

// The Slider's sizes: the thumb's edge, which the bar and every position read.
const box = (length: string) => variant(Style.self({ '--_fk-range-slider-size': length }))

const edge = 'var(--_fk-range-slider-size)'
// The distance a thumb's center travels: native thumbs stay inside their input.
const travel = `(100% - ${edge})`
const low = 'var(--fk-range-low)'
const high = 'var(--fk-range-high)'

/**
 * A rule on the thumb in both engines. One selector list would do nothing,
 * since an engine drops a whole list holding a pseudo-element it does not know.
 */
const onThumb = (state: string, declarations: Declarations): StyleValue =>
  Style.compose(
    Style.pseudo(`${state}::-webkit-slider-thumb`, declarations),
    Style.pseudo(`${state}::-moz-range-thumb`, declarations),
  )

export const RangeSlider = Style.recipeFor(RangeSliderSlots)({
  base: {
    // A track wide enough to drag, as the Slider's is.
    root: component(
      Style.self({ display: 'grid', gap: ref.space['2xs'], minInlineSize: '12rem' }),
      disabled,
    ),
    label: component(
      Style.self({
        margin: '0',
        color: ref.text.overt,
        ...role('body'),
        fontWeight: ref.weight.medium,
      }),
    ),
    control: component(Style.self({ position: 'relative', blockSize: edge })),
    track: component(
      Style.self({
        position: 'absolute',
        insetInlineStart: '0',
        insetInlineEnd: '0',
        insetBlockStart: '50%',
        translate: '0 -50%',
        blockSize: `calc(${edge} * 0.375)`,
        borderRadius: ref.radius.full,
        background: ref.surface.muted,
      }),
    ),
    range: component(
      Style.self({
        position: 'absolute',
        insetBlockStart: '0',
        insetBlockEnd: '0',
        insetInlineStart: `calc(${edge} / 2 + ${travel} * ${low})`,
        inlineSize: `calc(${travel} * (${high} - ${low}))`,
        borderRadius: ref.radius.full,
        background: toneVar('fill'),
      }),
    ),
    thumb: component(
      Style.self({
        position: 'absolute',
        insetBlockStart: '0',
        blockSize: edge,
        margin: '0',
        appearance: 'none',
        background: 'transparent',
        pointerEvents: 'none',
      }),
      // Each input spans only where its thumb may go, so its own scale matches the whole track's.
      Style.pseudo('[data-thumb="low"]', {
        insetInlineStart: '0',
        inlineSize: `calc(${edge} + ${travel} * ${high})`,
      }),
      Style.pseudo('[data-thumb="high"]', {
        insetInlineStart: `calc(${travel} * ${low})`,
        inlineSize: `calc(${edge} + ${travel} * (1 - ${low}))`,
      }),
      Style.nest('[data-raised="low"] > &[data-thumb="low"]', { zIndex: '1' }),
      Style.pseudo('::-webkit-slider-runnable-track', { blockSize: '100%', background: 'none' }),
      Style.pseudo('::-moz-range-track', { background: 'none' }),
      onThumb('', {
        appearance: 'none',
        boxSizing: 'border-box',
        blockSize: edge,
        inlineSize: edge,
        borderRadius: ref.radius.full,
        background: ref.surface.base,
        border: `${ref.border.thick} solid ${toneVar('fill')}`,
        cursor: 'pointer',
        pointerEvents: 'auto',
        ...transition('background-color, border-color'),
      }),
      Style.pseudo(':focus-visible', { outline: 'none' }),
      onThumb(':focus-visible', {
        outline: `${ref.border.thick} solid ${ref.outline.focus}`,
        outlineOffset: '2px',
      }),
      onThumb(':disabled', { cursor: 'not-allowed' }),
    ),
  },
  variants: {
    tone: {
      accent: { root: tones.accent },
      neutral: { root: tones.ink },
    },
    size: {
      sm: { root: box('0.75rem') },
      md: { root: box('1rem') },
      lg: { root: box('1.25rem') },
    },
  },
  defaults: { tone: 'accent', size: 'md' },
})

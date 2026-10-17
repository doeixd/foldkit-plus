/**
 * A slider in Fluid's look, one number or a range alike: a thick rounded
 * track that fills in the tone up to each thumb's far edge, so a thumb rides
 * inside the end of the fill. `track: 'thin'` is the slim bar instead, filled
 * between thumb centers, with the same ringed thumbs over it. `track:
 * 'paint'` draws a picture of the values instead of a fill, which what holds
 * the slider sets (a color picker's hue). `label: 'hidden'` keeps the label
 * for assistive technology only. `size` is the thumb's edge, which the track
 * and every position read.
 *
 * Marks are dots on the track, in the fill's own ink where it covers them;
 * ticks, a dot at every step, are quieter; a mark's label sits under the
 * track. A shown value sits above its thumb (`value: 'above'`, the control
 * making room for it), inside it (`'inside'`, which widens the thumb into a
 * pill; it reads best at `md` or `lg`), or at the end of the label's row
 * (`'end'`, as shadcn and Fluid show it). All are placed by logical insets,
 * so they mirror right to left with the native thumbs, and turn with a
 * vertical slider, whose control runs bottom to top in a vertical writing
 * mode; its words stay upright.
 *
 * Each thumb is a native range input with its own look removed. One thumb
 * spans the whole track and takes a press anywhere on it; a range's two take
 * the pointer on their thumbs only, so the one underneath stays reachable
 * where the inputs overlap.
 */
import { Style, type Declarations, type StyleValue } from 'foldkit-mixins'
import { Utilities } from 'foldkit-mixins/utilities'
import { role } from 'foldkit-mixins/theme'
import { SliderSlots } from '../slider.js'
import { component, ref, tones, toneVar, transition, variant } from './design.js'

/**
 * The thumb's edge length; the track and every position read it, so sizes
 * set it on the root they inherit from.
 */
const box = (length: string) => variant(Style.self({ '--_fk-slider-size': length }))

const edge = 'var(--_fk-slider-size)'
// The thumb's inline size: its edge, unless a value inside widens it.
const thumbSize = `var(--_fk-slider-thumb, ${edge})`
// The distance a thumb's center travels: native thumbs stay inside their input.
const travel = `(100% - ${thumbSize})`
const low = 'var(--fk-slider-low)'
const high = 'var(--fk-slider-high)'
// Where a mark or a shown value lies: the center of a thumb at its share.
const at = `calc(${thumbSize} / 2 + ${travel} * var(--fk-slider-at))`
const markSize = `calc(${edge} * 0.25)`
// Centered across the track in either orientation, where a physical translate would not turn.
const acrossCenter: Declarations = { insetBlock: '0', marginBlock: 'auto' }
// Words in a vertical control would otherwise lie on their side.
const upright: Declarations = { writingMode: 'horizontal-tb' }
const vertical = '[data-orientation="vertical"] > &'
/**
 * Upright words on a vertical track, placed in their own terms, since an
 * element's logical insets follow its own writing mode (and the track's
 * `direction: rtl`): `at` up from the bottom, and `beside` the track in
 * physical sides, which `vertical-lr` fixes in every direction (its block
 * start is the left).
 */
const uprightAt = (beside: Declarations): Declarations => ({
  insetInline: 'auto',
  insetBlockStart: 'auto',
  insetBlockEnd: at,
  ...beside,
})
const gap = ref.space['2xs']

/**
 * A rule on the thumb in both engines. One selector list would do nothing,
 * since an engine drops a whole list holding a pseudo-element it does not know.
 */
const onThumb = (state: string, declarations: Declarations): StyleValue =>
  Style.compose(
    Style.pseudo(`${state}::-webkit-slider-thumb`, declarations),
    Style.pseudo(`${state}::-moz-range-thumb`, declarations),
  )

// Drawn over the track, never taking a press meant for a thumb.
const overlay: Declarations = { position: 'absolute', pointerEvents: 'none' }

/**
 * A box of no width at `at` whose text centers on it and overflows both
 * sides evenly, so it centers on a thumb in either direction with no
 * physical translate.
 */
const centeredAt: Declarations = {
  ...overlay,
  insetInlineStart: at,
  inlineSize: '0',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
}

export const Slider = Style.recipeFor(SliderSlots)({
  base: {
    // A track wide enough to drag, where a row or a centered box would
    // shrink it to its label.
    root: component(
      Style.self({ display: 'grid', gap: ref.space['2xs'], minInlineSize: '12rem' }),
      Style.pseudo('[data-disabled]', { opacity: '0.5' }),
      Style.pseudo('[data-orientation="vertical"]', { minInlineSize: '0', justifyItems: 'start' }),
    ),
    header: component(
      Style.self({
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: ref.space.xs,
      }),
    ),
    label: component(
      Style.self({
        margin: '0',
        color: ref.text.overt,
        ...role('body'),
        fontWeight: ref.weight.medium,
      }),
    ),
    // Shown only by `value: 'end'`.
    output: component(
      Style.self({
        display: 'none',
        color: ref.text.muted,
        ...role('body'),
        fontVariantNumeric: 'tabular-nums',
      }),
    ),
    control: component(
      Style.self({ position: 'relative', blockSize: edge }),
      Style.pseudo('[data-labels]', {
        marginBlockEnd: `calc(${role('caption').lineHeight} + ${gap})`,
      }),
      // Beside a vertical track, words take their width rather than a line.
      Style.pseudo('[data-labels][data-orientation="vertical"]', {
        marginBlockEnd: ref.space['2xl'],
      }),
      // Bottom to top: a vertical writing mode, its inline start at the bottom.
      Style.pseudo('[data-orientation="vertical"]', {
        writingMode: 'vertical-lr',
        direction: 'rtl',
        inlineSize: 'var(--fk-slider-length, 10rem)',
      }),
    ),
    track: component(
      Style.self({
        position: 'absolute',
        insetInlineStart: '0',
        insetInlineEnd: '0',
        ...acrossCenter,
        blockSize: edge,
        borderRadius: ref.radius.full,
        background: ref.surface.muted,
      }),
    ),
    // To the far edge of each thumb: one thumb fills from the start of the track.
    fill: component(
      Style.self({
        position: 'absolute',
        insetBlockStart: '0',
        insetBlockEnd: '0',
        insetInlineStart: '0',
        inlineSize: `calc(${thumbSize} + ${travel} * ${high})`,
        borderRadius: ref.radius.full,
        background: toneVar('fill'),
      }),
      Style.nest('[data-range] > * > &', {
        insetInlineStart: `calc(${travel} * ${low})`,
        inlineSize: `calc(${thumbSize} + ${travel} * (${high} - ${low}))`,
      }),
    ),
    mark: component(
      Style.self({
        ...overlay,
        ...acrossCenter,
        insetInlineStart: at,
        marginInlineStart: `calc(${markSize} / -2)`,
        blockSize: markSize,
        inlineSize: markSize,
        borderRadius: ref.radius.full,
        background: ref.text.muted,
      }),
      Style.pseudo('[data-filled]', { background: toneVar('on-fill') }),
      Style.pseudo('[data-tick]', { opacity: '0.5' }),
    ),
    markLabel: component(
      Style.self({
        ...centeredAt,
        ...upright,
        insetBlockStart: `calc(100% + ${gap})`,
        color: ref.text.muted,
        ...role('caption'),
      }),
      Style.nest(vertical, {
        inlineSize: 'auto',
        blockSize: '0',
        ...uprightAt({ left: `calc(100% + ${gap})` }),
      }),
    ),
    value: component(
      Style.self({
        ...centeredAt,
        ...upright,
        color: ref.text.muted,
        fontWeight: ref.weight.medium,
      }),
      // Of no height on a vertical track, so its words center on the thumb there too.
      Style.nest(vertical, { inlineSize: 'auto', blockSize: '0' }),
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
      // One thumb spans the track and takes a press anywhere on it.
      Style.pseudo('[data-thumb="value"]', {
        insetInlineStart: '0',
        inlineSize: '100%',
        pointerEvents: 'auto',
        cursor: 'pointer',
      }),
      // A range's inputs each span only where their thumb may go, so their scale is the track's.
      Style.pseudo('[data-thumb="low"]', {
        insetInlineStart: '0',
        inlineSize: `calc(${thumbSize} + ${travel} * ${high})`,
      }),
      Style.pseudo('[data-thumb="high"]', {
        insetInlineStart: `calc(${travel} * ${low})`,
        inlineSize: `calc(${thumbSize} + ${travel} * (1 - ${low}))`,
      }),
      Style.nest('[data-raised="low"] > &[data-thumb="low"]', { zIndex: '1' }),
      Style.pseudo('::-webkit-slider-runnable-track', { blockSize: '100%', background: 'none' }),
      Style.pseudo('::-moz-range-track', { background: 'none' }),
      onThumb('', {
        appearance: 'none',
        boxSizing: 'border-box',
        blockSize: edge,
        inlineSize: thumbSize,
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
      Style.pseudo(':disabled', { cursor: 'not-allowed' }),
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
    track: {
      thick: {},
      // A picture of the values instead of a fill, such as a color's hue:
      // `--fk-slider-paint` is the track's background, and
      // `--fk-slider-thumb-paint` the thumb's, each set by what holds the slider.
      paint: {
        track: variant(Style.self({ background: `var(--fk-slider-paint, ${ref.surface.muted})` })),
        fill: variant(Style.self({ display: 'none' })),
        thumb: variant(
          onThumb('', {
            background: `var(--fk-slider-thumb-paint, ${ref.surface.base})`,
            borderColor: ref.surface.base,
            boxShadow: ref.shadow.sm,
          }),
        ),
      },
      // Between thumb centers: one thumb fills from the start of the track.
      thin: {
        track: variant(Style.self({ blockSize: `calc(${edge} * 0.375)` })),
        fill: variant(
          Style.self({ inlineSize: `calc(${thumbSize} / 2 + ${travel} * ${high})` }),
          Style.nest('[data-range] > * > &', {
            insetInlineStart: `calc(${thumbSize} / 2 + ${travel} * ${low})`,
            inlineSize: `calc(${travel} * (${high} - ${low}))`,
          }),
        ),
      },
    },
    value: {
      above: {
        control: variant(
          Style.pseudo('[data-values]', {
            marginBlockStart: `calc(${role('caption').lineHeight} + ${gap})`,
          }),
          Style.pseudo('[data-values][data-orientation="vertical"]', {
            marginBlockStart: ref.space['2xl'],
          }),
        ),
        value: variant(
          Style.self({ insetBlockEnd: `calc(100% + ${gap})`, ...role('caption') }),
          Style.nest(vertical, uprightAt({ right: `calc(100% + ${gap})` })),
        ),
      },
      end: {
        output: variant(Style.self({ display: 'inline' })),
        value: variant(Style.self({ display: 'none' })),
      },
      inside: {
        control: variant(
          Style.pseudo('[data-values]', { '--_fk-slider-thumb': `calc(${edge} * 2.5)` }),
        ),
        value: variant(
          Style.self({
            insetBlockStart: '0',
            insetBlockEnd: '0',
            color: ref.text.overt,
            ...role('micro'),
          }),
          Style.nest(vertical, uprightAt({ left: '0', right: '0' })),
        ),
      },
    },
    // Hidden, the label still names the thumb, as when a picker's own words say what it is.
    label: {
      shown: {},
      hidden: { header: variant(Utilities.srOnly) },
    },
  },
  defaults: { tone: 'accent', size: 'md', track: 'thick', value: 'above', label: 'shown' },
})

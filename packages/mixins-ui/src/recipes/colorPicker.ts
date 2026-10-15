/**
 * Color picker: the swatch and its text over three gradient tracks, each a
 * native range with its look removed. A track paints what its channel would
 * give with the other two held, read from the root's `--fk-color-*`; the
 * thumb is the current color in a ring of the page's surface. Presets are
 * round swatches, the checked one ringed in the text color. `size` is the
 * thumb's edge, which the track and the swatches scale from.
 */
import { Style, type Declarations, type StyleValue } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { ColorPickerSlots } from '../colorPicker.js'
import { component, disabled, focusRing, imageEdge, ref, transition, variant } from './design.js'

const box = (length: string) => variant(Style.self({ '--_fk-color-picker-size': length }))

const sizes = {
  sm: box('0.875rem'),
  md: box('1.125rem'),
  lg: box('1.375rem'),
} as const

const edge = 'var(--_fk-color-picker-size)'
const [l, c, h] = ['var(--fk-color-l)', 'var(--fk-color-c)', 'var(--fk-color-h)']

/** Each channel's track: its whole range at the other two channels' values. */
const tracks = {
  l: `linear-gradient(to right in oklch, oklch(0% ${c} ${h}), oklch(100% ${c} ${h}))`,
  c: `linear-gradient(to right in oklch, oklch(${l} 0 ${h}), oklch(${l} 0.4 ${h}))`,
  // A stop every sixth of a turn: between two stops a gradient takes the shorter way round, so two would not turn at all.
  h: `linear-gradient(to right in oklch, ${[0, 60, 120, 180, 240, 300, 360]
    .map(hue => `oklch(${l} ${c} ${hue})`)
    .join(', ')})`,
} as const

/** The thumb in both engines' pseudo-elements: one selector list would be dropped whole by the engine that knows neither name. */
const thumb = (declarations: Declarations): StyleValue =>
  Style.compose(
    Style.nest('&::-webkit-slider-thumb', declarations),
    Style.nest('&::-moz-range-thumb', declarations),
  )

const whole = { gridColumn: '1 / -1' } as const

export const ColorPicker = Style.recipeFor(ColorPickerSlots)({
  base: {
    root: component(
      Style.self({
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        alignItems: 'center',
        gap: ref.space.xs,
        minInlineSize: '14rem',
      }),
    ),
    label: component(
      Style.self({
        ...whole,
        color: ref.text.overt,
        ...role('body'),
        fontWeight: ref.weight.medium,
      }),
    ),
    swatch: component(
      Style.self({
        inlineSize: `calc(${edge} * 2)`,
        blockSize: `calc(${edge} * 2)`,
        borderRadius: ref.radius.md,
        background: 'var(--fk-color)',
        ...imageEdge,
      }),
    ),
    value: component(
      Style.self({
        color: ref.text.default,
        ...role('caption'),
        fontVariantNumeric: 'tabular-nums',
      }),
    ),
    channel: component(Style.self({ ...whole, display: 'grid', gap: ref.space['2xs'] })),
    channelLabel: component(Style.self({ color: ref.text.muted, ...role('caption') })),
    slider: component(
      Style.self({
        appearance: 'none',
        display: 'block',
        inlineSize: '100%',
        blockSize: `calc(${edge} * 0.75)`,
        margin: '0',
        borderRadius: ref.radius.full,
        cursor: 'pointer',
        ...imageEdge,
      }),
      Style.pseudo('[data-channel="l"]', { background: tracks.l }),
      Style.pseudo('[data-channel="c"]', { background: tracks.c }),
      Style.pseudo('[data-channel="h"]', { background: tracks.h }),
      thumb({
        appearance: 'none',
        boxSizing: 'border-box',
        inlineSize: edge,
        blockSize: edge,
        borderRadius: ref.radius.full,
        background: 'var(--fk-color)',
        border: `${ref.border.thick} solid ${ref.surface.base}`,
        boxShadow: ref.shadow.sm,
      }),
      focusRing,
      disabled,
    ),
    presets: component(
      Style.self({ ...whole, display: 'flex', flexWrap: 'wrap', gap: ref.space['2xs'] }),
    ),
    preset: component(
      Style.self({
        appearance: 'none',
        margin: '0',
        inlineSize: `calc(${edge} * 1.5)`,
        blockSize: `calc(${edge} * 1.5)`,
        borderRadius: ref.radius.full,
        background: 'var(--fk-color)',
        cursor: 'pointer',
        ...imageEdge,
        ...transition('box-shadow'),
      }),
      // A ring of the surface, then of the text, so it reads around any color; a shadow, so the focus outline outside it still shows.
      Style.pseudo(':checked', {
        boxShadow: `0 0 0 ${ref.border.thick} ${ref.surface.base}, 0 0 0 calc(${ref.border.thick} * 2) ${ref.text.default}`,
      }),
      focusRing,
      Style.pseudo(':focus-visible', { outlineOffset: `calc(${ref.border.thick} * 3)` }),
      disabled,
    ),
  },
  variants: {
    size: {
      sm: { root: sizes.sm },
      md: { root: sizes.md },
      lg: { root: sizes.lg },
    },
  },
  defaults: { size: 'md' },
})

/**
 * Color picker in ReUI's layout: the saturation and brightness area on top,
 * then the eyedropper, the hue and alpha tracks and a swatch in a row, then
 * the format and the text, then the presets. Every paint is read from the
 * custom properties the view computes from the color (`--fk-color-*`), so
 * the recipe writes no color of its own beyond the theme's: the area is
 * `--fk-color-area`, and each `channel` hands its Slider a track
 * (`--fk-slider-paint`) and a thumb (`--fk-slider-thumb-paint`) for
 * `Recipes.Slider({ track: 'paint' })` to draw. A track runs away from the
 * side its minimum is drawn on, the right one right to left; the area is a
 * plane, not a line of text, and is drawn the same in either direction.
 * Transparency shows over a checkerboard of the surface's two steps. `size`
 * is the thumb's edge, which the area, the swatch and the presets scale from.
 */
import { Style, type Declarations, type StyleValue } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { ColorPickerSlots } from '../colorPicker.js'
import {
  component,
  disabled,
  focusRing,
  hover,
  imageEdge,
  onLadder,
  ref,
  transition,
  unfilledHover,
  variant,
} from './design.js'

const box = (length: string) => variant(Style.self({ '--_fk-color-picker-size': length }))

const edge = 'var(--_fk-color-picker-size)'

// A pipette, stroked: a mask, so it takes the button's text color.
const pipette = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m2 22 1-1h3l9-9M3 21v-3l9-9m3-3 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z'/%3E%3C/svg%3E")`

const checker = `repeating-conic-gradient(${ref.surface.muted} 0 25%, ${ref.surface.base} 0 50%) 0 0 / calc(${edge} / 2) calc(${edge} / 2)`

/** A channel's track, running away from its minimum's side. */
const paints = (toward: 'right' | 'left') => ({
  hue: `linear-gradient(to ${toward}, var(--fk-color-hues))`,
  alpha: `linear-gradient(to ${toward}, transparent, var(--fk-color-opaque)), ${checker}`,
})
const [ltr, rtl] = [paints('right'), paints('left')]

const channelOf = (key: 'hue' | 'alpha', thumb: string): StyleValue =>
  Style.compose(
    Style.pseudo(`[data-channel="${key}"]`, {
      '--fk-slider-paint': ltr[key],
      '--fk-slider-thumb-paint': thumb,
    }),
    Style.pseudo(`[data-channel="${key}"]:dir(rtl)`, { '--fk-slider-paint': rtl[key] }),
  )

/** A bordered field on the size ladder: the format select and the text. */
const field: Declarations = {
  ...onLadder,
  boxSizing: 'border-box',
  border: `${ref.border.thin} solid ${ref.outline.default}`,
  borderRadius: ref.radius.md,
  background: ref.surface.base,
  color: ref.text.default,
  font: 'inherit',
  ...role('body'),
}

// The color over the checkerboard, so a translucent one shows as such.
const swatched: Declarations = {
  background: `linear-gradient(var(--fk-color), var(--fk-color)), ${checker}`,
  ...imageEdge,
}

export const ColorPicker = Style.recipeFor(ColorPickerSlots)({
  base: {
    root: component(
      Style.self({
        display: 'grid',
        gap: ref.space.sm,
        inlineSize: 'min(100%, 18rem)',
      }),
      Style.pseudo('[data-disabled]', { opacity: '0.5' }),
    ),
    label: component(
      Style.self({ color: ref.text.overt, ...role('body'), fontWeight: ref.weight.medium }),
    ),
    area: component(
      Style.self({
        position: 'relative',
        blockSize: `calc(${edge} * 9)`,
        borderRadius: ref.radius.md,
        background: 'var(--fk-color-area)',
        // The pointer drags the color, never the page.
        touchAction: 'none',
        cursor: 'crosshair',
        ...imageEdge,
      }),
    ),
    // Physical, as the plane is: its left is no saturation in either direction.
    areaThumb: component(
      Style.self({
        position: 'absolute',
        left: 'calc(var(--fk-color-x) * 100%)',
        top: 'calc(var(--fk-color-y) * 100%)',
        boxSizing: 'border-box',
        inlineSize: edge,
        blockSize: edge,
        translate: '-50% -50%',
        borderRadius: ref.radius.full,
        border: `${ref.border.thick} solid ${ref.surface.base}`,
        background: 'var(--fk-color-opaque)',
        boxShadow: ref.shadow.sm,
      }),
      focusRing,
    ),
    controls: component(Style.self({ display: 'flex', alignItems: 'center', gap: ref.space.sm })),
    eyedropper: component(
      Style.self({
        display: 'inline-grid',
        placeItems: 'center',
        flex: 'none',
        inlineSize: ladder('height'),
        blockSize: ladder('height'),
        padding: '0',
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: 'transparent',
        color: ref.text.default,
        cursor: 'pointer',
        ...transition('background-color'),
      }),
      Style.nest('&::before', {
        content: "''",
        inlineSize: ladder('icon'),
        blockSize: ladder('icon'),
        background: 'currentColor',
        mask: `${pipette} center / contain no-repeat`,
      }),
      hover({ background: unfilledHover }),
      focusRing,
      disabled,
    ),
    channels: component(
      Style.self({ display: 'grid', gap: ref.space.xs, flex: '1', minInlineSize: '0' }),
    ),
    channel: component(
      Style.self({ minInlineSize: '0' }),
      channelOf('hue', 'var(--fk-color-hue)'),
      channelOf('alpha', 'var(--fk-color)'),
    ),
    swatch: component(
      Style.self({
        flex: 'none',
        inlineSize: `calc(${edge} * 2.25)`,
        blockSize: `calc(${edge} * 2.25)`,
        borderRadius: ref.radius.md,
        ...swatched,
      }),
    ),
    fields: component(Style.self({ display: 'flex', gap: ref.space.xs })),
    format: component(
      Style.self({ ...field, flex: 'none', cursor: 'pointer' }),
      focusRing,
      disabled,
    ),
    input: component(
      Style.self({ ...field, flex: '1', minInlineSize: '0', fontVariantNumeric: 'tabular-nums' }),
      Style.pseudo('[aria-invalid="true"]', { borderColor: ref.error.outline }),
      focusRing,
      disabled,
    ),
    presets: component(Style.self({ display: 'flex', flexWrap: 'wrap', gap: ref.space['2xs'] })),
    preset: component(
      Style.self({
        appearance: 'none',
        margin: '0',
        inlineSize: `calc(${edge} * 1.5)`,
        blockSize: `calc(${edge} * 1.5)`,
        borderRadius: ref.radius.md,
        cursor: 'pointer',
        ...swatched,
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
    picker: component(Style.self({ display: 'inline-block' })),
    trigger: component(
      Style.self({ display: 'inline-flex', alignItems: 'center', gap: ref.space.xs }),
    ),
    value: component(
      Style.self({ color: ref.text.default, ...role('body'), fontVariantNumeric: 'tabular-nums' }),
    ),
  },
  variants: {
    size: {
      sm: { root: box('0.875rem'), picker: box('0.875rem') },
      md: { root: box('1.125rem'), picker: box('1.125rem') },
      lg: { root: box('1.375rem'), picker: box('1.375rem') },
    },
  },
  defaults: { size: 'md' },
})

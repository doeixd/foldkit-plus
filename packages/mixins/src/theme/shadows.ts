/**
 * The shadow lists the shadow knobs choose between: the elevation scale drawn
 * soft or hard (`shadow.style`), and a control's relief (`shadow.relief`).
 * Each is drawn in `shadow.color`, which a palette sets, and faded by the
 * `shadow-strength` knob.
 */

const shade = 'var(--fk-shadow-color, oklch(0% 0 0 / 0.12))'
const strength = 'var(--fk-knob-shadow-strength, 100%)'

/** No shadow, as a shadow: one a transition can interpolate from, unlike `none`. */
export const FLAT = '0 0 #0000'

/** Layers in the shadow's color, faded by `shadow-strength`. */
export const shadow = (...layers: ReadonlyArray<string>) =>
  layers.map(layer => `${layer} color-mix(in oklch, ${shade} ${strength}, transparent)`).join(', ')

/** A hard step: the shadow's color, nearly opaque, offset with no blur. */
const hard = (offset: number) =>
  `${offset}px ${offset}px 0 0 color-mix(in oklch, oklch(from ${shade} l c h / 0.9) ${strength}, transparent)`

/** An edge of a bevel: `color` faded by `shadow-strength`, as every shadow is. */
const edge = (color: string) => `color-mix(in oklch, ${color} ${strength}, transparent)`
/** Lit from the top left: white, dimmer in a dark scheme, where white would glare. */
const lit = (alpha: number, darkAlpha: number) =>
  edge(`light-dark(oklch(100% 0 0 / ${alpha}), oklch(100% 0 0 / ${darkAlpha}))`)
const shaded = (alpha: number) => edge(`oklch(from ${shade} l c h / ${alpha})`)

/**
 * Two rings of edges, lit at the top left and shaded at the bottom right,
 * flipped when sunken. Raised, the outer ring is drawn outside the
 * border: a button's border carries its fill, and an inset ring lay inside
 * it, so its darkest edge sat within a line of the button's own color.
 */
const raisedBevel = [
  `1px 1px 0 0 ${shaded(0.9)}`,
  `-1px -1px 0 0 ${lit(1, 0.3)}`,
  `inset -1px -1px 0 0 ${shaded(0.4)}`,
  `inset 1px 1px 0 0 ${lit(0.5, 0.12)}`,
].join(', ')
const sunkenBevel = [
  `inset 1px 1px 0 0 ${shaded(0.9)}`,
  `inset -1px -1px 0 0 ${lit(1, 0.3)}`,
  `inset 2px 2px 0 0 ${shaded(0.4)}`,
  `inset -2px -2px 0 0 ${lit(0.5, 0.12)}`,
].join(', ')

/**
 * Raised a little to a lot: a pressed control, a lifted cell, a menu, a
 * dialog. Soft, each step is a tight contact layer plus a wide ambient one,
 * so large surfaces diffuse instead of ringing; `2xl` is the modal step.
 * Hard, as retro and brutalist interfaces draw it, each step is a solid
 * offset copy, deeper the higher it sits.
 */
export const elevation = {
  soft: {
    xs: shadow('0 1px 2px 0'),
    sm: shadow('0 1px 3px 0', '0 1px 2px -1px'),
    md: shadow('0 4px 6px -1px', '0 2px 4px -2px'),
    lg: shadow('0 12px 28px -8px', '0 4px 8px -4px'),
    xl: shadow('0 24px 48px -12px', '0 8px 16px -8px'),
    '2xl': shadow('0 32px 64px -16px', '0 12px 24px -12px'),
    inset: shadow('inset 0 2px 4px 0'),
  },
  hard: {
    xs: hard(1),
    sm: hard(2),
    md: hard(3),
    lg: hard(4),
    xl: hard(6),
    '2xl': hard(8),
    inset: `inset ${hard(2)}`,
  },
} as const

/**
 * How controls stand off the page: a button's resting shadow (`raised`), the
 * one it takes held or on (`pressed`), and a field's well (`field`). `flat`
 * gives them none; `soft` lifts buttons a hair and sinks fields a hair;
 * `hard` drops solid offset copies; `bevel` draws lit and shaded edges, the
 * raised and sunken chrome of a 1990s desktop.
 */
export const reliefs = {
  flat: { raised: FLAT, pressed: FLAT, field: FLAT },
  soft: {
    raised: shadow('0 1px 2px 0'),
    pressed: shadow('inset 0 1px 2px 0'),
    field: shadow('inset 0 1px 2px 0'),
  },
  hard: { raised: hard(2), pressed: hard(1), field: hard(2) },
  bevel: { raised: raisedBevel, pressed: sunkenBevel, field: sunkenBevel },
} as const

/** `lists` as knob variables, each name prefixed: `{ xs }` to `{ 'shadow-xs' }`. */
export const asVariables = <const P extends string, L extends Readonly<Record<string, string>>>(
  prefix: P,
  lists: L,
) =>
  Object.fromEntries(Object.entries(lists).map(([name, list]) => [`${prefix}-${name}`, list])) as {
    readonly [K in keyof L & string as `${P}-${K}`]: string
  }

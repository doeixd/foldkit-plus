/**
 * The non-color scales a design system shares across themes. Space, radius,
 * and durations multiply by the `density`, `radius-factor`, and `motion`
 * knobs, so a compact, a rounder, or a stiller theme is one override
 * (`motion: '0'` stills every recipe transition). `travel` multiplies only
 * the durations of things that move or resize: the reset sets it to 0 under
 * `prefers-reduced-motion`, so objects stop travelling and fades stay. `shadow` is drawn in `shadow.color`,
 * which a palette sets (`Theme.oklch` does, stronger in a dark scheme, where
 * a shadow mixed from the text would glow); alone it falls back to black.
 * Every layer is mixed toward transparent by the `shadow-strength` knob, so
 * one override dims the whole elevation system without touching its shapes.
 * `breakpoint` is the record
 * `Style.responsive` takes; `breakpointWidths` gives the same names as pixel
 * thresholds for `foldkit-primitives/media` Breakpoints.
 */
import { DiagnosticError } from '../diagnostics.js'
import { define } from './core.js'

const space = (rem: number) => `calc(${rem}rem * var(--fk-knob-density))`
const radius = (px: number) => `calc(${px}px * var(--fk-knob-radius-factor))`
const duration = (ms: number) => `calc(${ms}ms * var(--fk-knob-motion))`
const textScale = 'var(--fk-knob-text-scale, 1)'
/**
 * A step of the type scale: at or below the body size it scales with the
 * text alone; above it, its distance from the body size also scales with
 * `heading-scale`, so headings can stand further off the text or closer.
 */
const text = (rem: number) =>
  rem <= 1
    ? `calc(${rem}rem * ${textScale})`
    : `calc((1rem + ${Number((rem - 1).toFixed(4))}rem * var(--fk-knob-heading-scale, 1)) * ${textScale})`
const leading = (ratio: number) => `calc(${ratio} * var(--fk-knob-leading, 1))`
const shade = 'var(--fk-shadow-color, oklch(0% 0 0 / 0.12))'
const strength = 'var(--fk-knob-shadow-strength, 100%)'
/** No shadow, as a shadow: one a transition can interpolate from, unlike `none`. */
const FLAT = '0 0 #0000'
const shadow = (...layers: ReadonlyArray<string>) =>
  layers.map(layer => `${layer} color-mix(in oklch, ${shade} ${strength}, transparent)`).join(', ')

export const tokens = define({
  knob: {
    density: '1',
    'radius-factor': '1',
    motion: '1',
    travel: '1',
    // The size ladder's step: 0 default, 1 compact; `ladder` reads it.
    step: '0',
    'shadow-strength': '100%',
    // The reading type: every size of the scale (`text-scale`), how far the
    // headings stand above the body (`heading-scale`), and the line height
    // (`leading`), each a multiplier.
    'text-scale': '1',
    'heading-scale': '1',
    leading: '1',
    // 1 rounds a pressable control (a button, a segmented tray) to a pill,
    // whatever the radius factor; 0 keeps `radius-md`.
    'control-round': '0',
  },
  space: {
    '3xs': space(0.125),
    '2xs': space(0.25),
    xs: space(0.5),
    sm: space(0.75),
    md: space(1),
    lg: space(1.5),
    xl: space(2),
    '2xl': space(3),
    '3xl': space(4),
  },
  radius: {
    xs: radius(2),
    sm: radius(3),
    md: radius(6),
    lg: radius(8),
    xl: radius(12),
    // A pill, which squares off only where the knob is 0, as a boxy theme's are.
    full: 'calc(9999px * min(var(--fk-knob-radius-factor), 1))',
    // A pressable control's corner: `md`, or a pill when `control-round` is 1.
    control: 'calc(var(--fk-radius-md) + var(--fk-knob-control-round, 0) * 9999px)',
  },
  font: { body: 'system-ui, sans-serif', heading: 'inherit', mono: 'ui-monospace, monospace' },
  size: {
    xs: text(0.75),
    sm: text(0.875),
    md: text(1),
    lg: text(1.125),
    xl: text(1.25),
    '2xl': text(1.5),
    '3xl': text(1.875),
    '4xl': text(2.25),
  },
  leading: {
    tight: leading(1.2),
    snug: leading(1.375),
    normal: leading(1.5),
    relaxed: leading(1.6),
  },
  // `heading` is what a heading or a title is set in.
  weight: { normal: '400', medium: '500', semibold: '600', bold: '700', heading: '600' },
  // A heading's letter spacing: set large, type reads better a little tighter.
  tracking: { heading: '-0.01em' },
  // Three tiers, as Fluid Functionalism's springs: the bigger the thing that
  // moves, the slower its tier. Hover, fades and focus rings are `fast`;
  // popups, tabs and short travel `moderate`; dialogs and large surfaces
  // `slow`. Each exit is a tween one tier quicker, so a dismissal reads as
  // final rather than as the entrance replayed.
  motion: {
    fast: duration(80),
    moderate: duration(160),
    slow: duration(240),
    'fast-exit': duration(60),
    'moderate-exit': duration(120),
    'slow-exit': duration(160),
    ease: 'ease-out',
    'ease-exit': 'ease-in',
    // Springs sampled as CSS easings, so they need no JavaScript and follow
    // the knobs through the duration they are paired with. `settle` is
    // critically damped: it lands exactly, for `fast` and `moderate` travel.
    settle:
      'linear(0, 0.035, 0.116, 0.218, 0.325, 0.428, 0.522, 0.605, 0.677, 0.737, 0.788, 0.83, 0.864, 0.892, 0.914, 0.932, 0.947, 0.958, 0.967, 0.974, 0.98, 0.984, 0.988, 0.991, 1)',
    // Damping ratio 0.88 (Fluid's bounce 0.12), for `slow`: a large surface
    // arrives with a little weight and no visible wobble.
    spring:
      'linear(0, 0.041, 0.136, 0.255, 0.379, 0.497, 0.603, 0.693, 0.768, 0.829, 0.876, 0.913, 0.941, 0.961, 0.976, 0.986, 0.993, 0.998, 1, 1.002, 1.003, 1.003, 1.003, 1.003, 1)',
  },
  // The size ladder's two ends, after Fluid Functionalism's: a 36px default
  // control and a 28px compact one, everything about a control stepping down
  // together. One height serves buttons, fields and the rows of a list, so a
  // popup's row lines up with the trigger that opened it. Read through
  // `ladder`, which blends the pair by the `step` knob.
  control: {
    height: '2.25rem',
    'height-compact': '1.75rem',
    pad: '0.75rem',
    'pad-compact': '0.625rem',
    'row-pad': '0.5rem',
    'row-pad-compact': '0.375rem',
    gap: '0.5rem',
    'gap-compact': '0.25rem',
    inset: '0.25rem',
    'inset-compact': '0.125rem',
    icon: '1rem',
    'icon-compact': '0.875rem',
  },
  // Six roles, each a size and a whole-pixel leading at both steps of the
  // ladder, after Fluid Functionalism's (body one notch up, at shadcn's 14px):
  // a caption in a menu and one in a table share a rhythm, and a compact
  // region reads as a smaller sibling of the same hierarchy. Pick by purpose:
  // `micro` is for keycaps, counters and tiny badges only. Read through `role`.
  type: {
    'display-size': '1.75rem',
    'display-size-compact': '1.5rem',
    'display-leading': '2.125rem',
    'display-leading-compact': '1.875rem',
    'title-size': '1rem',
    'title-size-compact': '0.9375rem',
    'title-leading': '1.375rem',
    'title-leading-compact': '1.25rem',
    'subtitle-size': '0.9375rem',
    'subtitle-size-compact': '0.875rem',
    'subtitle-leading': '1.375rem',
    'subtitle-leading-compact': '1.25rem',
    'body-size': '0.875rem',
    'body-size-compact': '0.8125rem',
    'body-leading': '1.25rem',
    'body-leading-compact': '1.125rem',
    'caption-size': '0.75rem',
    'caption-size-compact': '0.6875rem',
    'caption-leading': '1rem',
    'caption-leading-compact': '0.875rem',
    'micro-size': '0.6875rem',
    'micro-size-compact': '0.625rem',
    'micro-leading': '0.875rem',
    'micro-leading-compact': '0.75rem',
  },
  border: { thin: '1px', thick: '2px', heavy: '3px' },
  // Raised a little to a lot: a pressed control, a lifted cell, a menu, a
  // dialog. Each step is a tight contact layer plus a wide ambient one, so
  // large surfaces diffuse instead of ringing; `2xl` is the modal step.
  shadow: {
    xs: shadow('0 1px 2px 0'),
    sm: shadow('0 1px 3px 0', '0 1px 2px -1px'),
    md: shadow('0 4px 6px -1px', '0 2px 4px -2px'),
    lg: shadow('0 12px 28px -8px', '0 4px 8px -4px'),
    xl: shadow('0 24px 48px -12px', '0 8px 16px -8px'),
    '2xl': shadow('0 32px 64px -16px', '0 12px 24px -12px'),
    inset: shadow('inset 0 2px 4px 0'),
    // A control's relief: a button standing off the page (`raised`), pressed
    // into it while held or on (`pressed`), and a field's well (`field`).
    // Flat here; `relief` holds themes that give controls depth.
    raised: FLAT,
    pressed: FLAT,
    field: FLAT,
  },
  breakpoint: {
    sm: '(min-width: 40rem)',
    md: '(min-width: 48rem)',
    lg: '(min-width: 64rem)',
    xl: '(min-width: 80rem)',
  },
  // What a notch, a rounded corner or the home indicator takes from each edge of the
  // screen: 0 on a desktop, and everywhere unless the page's viewport meta says
  // `viewport-fit=cover`. Physical, as the screen is; a fixed bar pads the edge it touches.
  safe: {
    top: 'env(safe-area-inset-top, 0px)',
    right: 'env(safe-area-inset-right, 0px)',
    bottom: 'env(safe-area-inset-bottom, 0px)',
    left: 'env(safe-area-inset-left, 0px)',
  },
})

export type Tokens = typeof tokens

/** A dimension on the size ladder, by its default end's name. */
export type Rung = Exclude<keyof Tokens['control'], `${string}-compact`>

/**
 * A control's dimension on the size ladder: `name`'s default end blended
 * toward its compact one by the `step` knob, and spacing multiplied by
 * `density`. The blend is written here, not in a token, because a custom
 * property resolves where it is declared: a token would read the step at
 * `:root`, while this expression reads it on the element that uses it, so
 * `--fk-knob-step: 1` on a toolbar makes everything in it compact, a menu it
 * opens included while the panel stays in the page (an anchor's `portal:
 * false`); a portaled panel takes only the size its recipe chooses. A step of
 * `-0.5` is shadcn's large size, 40px.
 */
export const ladder = (name: Rung): string => {
  const stepped = blend('control', name)
  return name === 'icon' ? stepped : `calc(${stepped} * var(--fk-knob-density))`
}

/**
 * The radius of a rounded surface inset in another, so their corners are
 * concentric: the outer radius less the inset between them and the outer
 * surface's border, never below zero. Past a large radius, or with uneven
 * gaps, the two read as independent and may be tuned by eye.
 *
 * With no arguments, it reads what the nearest container that `nests` its
 * children published, so a row, a pill or a highlight inside a padded panel
 * follows the panel's corner without repeating its arithmetic. The values
 * inherit, so it reads the nearest ancestor that `nests`, however deep and in
 * whatever component; it is square only where no ancestor does.
 */
export function nested(): string
export function nested(outer: string, inset: string, border?: string): string
export function nested(outer?: string, inset?: string, border = '0px'): string {
  return outer === undefined || inset === undefined
    ? `max(0px, calc(var(--fk-outer-radius, 0px) - var(--fk-inset, 0px)))`
    : `max(0px, calc(${outer} - ${inset} - ${border}))`
}

/**
 * What a container that pads its children publishes for `nested()`: its
 * corner inside its border, and the inset to them. Spread it beside the
 * container's own radius and padding. The values are read on each child, so
 * a container deeper in that `nests` again publishes its own.
 */
export const nests = (
  radius: string,
  inset: string,
  border = '0px',
): { readonly '--fk-outer-radius': string; readonly '--fk-inset': string } => ({
  '--fk-outer-radius': `calc(${radius} - ${border})`,
  '--fk-inset': inset,
})

/** A step of `hardShadows`: the shadow's color, nearly opaque, offset with no blur. */
const hard = (offset: number) =>
  `${offset}px ${offset}px 0 0 color-mix(in oklch, oklch(from ${shade} l c h / 0.9) ${strength}, transparent)`

/**
 * The shadow scale drawn hard, as retro and brutalist interfaces draw it:
 * each step a solid offset copy, deeper the higher it sits. Compose it over
 * `tokens`; `shadow-strength` still fades it, and 0 takes it away.
 */
export const hardShadows = define({
  shadow: {
    xs: hard(1),
    sm: hard(2),
    md: hard(3),
    lg: hard(4),
    xl: hard(6),
    '2xl': hard(8),
    inset: `inset ${hard(2)}`,
  },
})

/** An edge of a bevel: `color` faded by `shadow-strength`, as every shadow is. */
const edge = (color: string) => `color-mix(in oklch, ${color} ${strength}, transparent)`
/** Lit from the top left: white, dimmer in a dark scheme, where white would glare. */
const lit = (alpha: number, darkAlpha: number) =>
  edge(`light-dark(oklch(100% 0 0 / ${alpha}), oklch(100% 0 0 / ${darkAlpha}))`)
const shaded = (alpha: number) => edge(`oklch(from ${shade} l c h / ${alpha})`)
/** Two rings of inset edges, the outer lit at `-1` and shaded at `1`, flipped when pressed in. */
const bevel = (sign: 1 | -1) =>
  [
    `inset ${-sign}px ${-sign}px 0 0 ${shaded(0.9)}`,
    `inset ${sign}px ${sign}px 0 0 ${lit(1, 0.3)}`,
    `inset ${-2 * sign}px ${-2 * sign}px 0 0 ${shaded(0.4)}`,
    `inset ${2 * sign}px ${2 * sign}px 0 0 ${lit(0.5, 0.12)}`,
  ].join(', ')

/**
 * How controls stand off the page, as token sets over `tokens`: a button's
 * resting shadow (`raised`), the one it takes held or on (`pressed`), and a
 * field's well (`field`). The shipped scales are flat. `soft` lifts buttons
 * a hair and sinks fields a hair; `hard` drops solid offset copies, as
 * `hardShadows` does for surfaces; `bevel` draws lit and shaded edges, the
 * raised and sunken chrome of a 1990s desktop. `shadow-strength` fades each.
 */
export const relief = {
  soft: define({
    shadow: {
      raised: shadow('0 1px 2px 0'),
      pressed: shadow('inset 0 1px 2px 0'),
      field: shadow('inset 0 1px 2px 0'),
    },
  }),
  hard: define({ shadow: { raised: hard(2), pressed: hard(1), field: hard(2) } }),
  bevel: define({ shadow: { raised: bevel(1), pressed: bevel(-1), field: bevel(-1) } }),
} as const

/** A role of the type scale. */
export type Role = 'display' | 'title' | 'subtitle' | 'body' | 'caption' | 'micro'

/**
 * Text in `role`: its size and leading on the size ladder, read on the
 * element like `ladder`, so a compact region's text steps down with its
 * controls.
 */
export const role = (name: Role): { readonly fontSize: string; readonly lineHeight: string } => ({
  fontSize: blend('type', `${name}-size`),
  lineHeight: blend('type', `${name}-leading`),
})

/** A token's default end blended toward its `-compact` one by the `step` knob. */
const blend = (group: string, name: string) => {
  const at = `var(--fk-${group}-${name})`
  return `calc(${at} + (var(--fk-${group}-${name}-compact) - ${at}) * var(--fk-knob-step))`
}

// A plain `min-width`, of the window or of a named container.
const MIN_WIDTH = /^(?:@container\s+[\w-]+\s+)?\(min-width:\s*(\d+(?:\.\d+)?)(rem|px)\)$/

/**
 * Each breakpoint query's `min-width` in pixels (rem at 16), so CSS and the
 * Model agree on what `md` means. A query that is not a plain `min-width`
 * is refused: it has no single threshold. A container's is its container's.
 */
export const breakpointWidths = (theme: {
  readonly breakpoint: { readonly [name: string]: string }
}): Readonly<Record<string, number>> => {
  const widths: Record<string, number> = {}
  for (const [name, query] of Object.entries(theme.breakpoint)) {
    const match = MIN_WIDTH.exec(query)
    if (match === null) {
      throw new DiagnosticError({
        source: 'theme',
        code: 'theme:unparseable-breakpoint',
        severity: 'error',
        message: `Breakpoint "${name}" is "${query}", not a "(min-width: <rem|px>)" query`,
        details: { name, query },
      })
    }
    const amount = Number(match[1])
    widths[name] = match[2] === 'rem' ? amount * 16 : amount
  }
  return Object.freeze(widths)
}

/**
 * The same breakpoints measured on a named container rather than the window:
 * `Theme.inContainer('page', Theme.tokens.breakpoint)` gives `md` as
 * `'@container page (min-width: 48rem)'`, for `Style.responsive` and a
 * responsive look. An element must be that container (`container: page /
 * inline-size`) for them to match.
 */
export const inContainer = <Breakpoints extends Readonly<Record<string, string>>>(
  name: string,
  breakpoints: Breakpoints,
): { readonly [K in keyof Breakpoints]: string } =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(breakpoints).map(([at, query]) => [at, `@container ${name} ${query}`]),
    ),
  ) as { readonly [K in keyof Breakpoints]: string }

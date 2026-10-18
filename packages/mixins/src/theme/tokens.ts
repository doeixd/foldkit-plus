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
const shade = 'var(--fk-shadow-color, oklch(0% 0 0 / 0.12))'
const strength = 'var(--fk-knob-shadow-strength, 100%)'
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
  },
  font: { body: 'system-ui, sans-serif', heading: 'inherit', mono: 'ui-monospace, monospace' },
  size: {
    xs: '0.75rem',
    sm: '0.875rem',
    md: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
  },
  leading: { tight: '1.2', snug: '1.375', normal: '1.5', relaxed: '1.6' },
  weight: { normal: '400', medium: '500', semibold: '600', bold: '700' },
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

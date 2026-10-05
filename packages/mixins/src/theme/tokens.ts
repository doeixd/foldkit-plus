/**
 * The non-color scales a design system shares across themes. Space and
 * radius multiply by the `density` and `radius-factor` knobs, so a compact
 * or a rounder theme is one override. `shadow` is drawn in `shadow.color`,
 * which a palette sets (`Theme.oklch` does, stronger in a dark scheme, where
 * a shadow mixed from the text would glow); alone it falls back to black. `breakpoint` is the record
 * `Style.responsive` takes; `breakpointWidths` gives the same names as pixel
 * thresholds for `foldkit-primitives/media` Breakpoints.
 */
import { DiagnosticError } from '../diagnostics.js'
import { define } from './core.js'

const space = (rem: number) => `calc(${rem}rem * var(--fk-knob-density))`
const radius = (px: number) => `calc(${px}px * var(--fk-knob-radius-factor))`
const shade = 'var(--fk-shadow-color, oklch(0% 0 0 / 0.12))'
const shadow = (...layers: ReadonlyArray<string>) =>
  layers.map(layer => `${layer} ${shade}`).join(', ')

export const tokens = define({
  knob: { density: '1', 'radius-factor': '1' },
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
    full: '9999px',
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
  motion: { fast: '150ms', normal: '250ms', ease: 'ease-out' },
  border: { thin: '1px', thick: '2px', heavy: '3px' },
  // Raised a little to a lot: a pressed control, a lifted cell, a menu, a dialog.
  shadow: {
    xs: shadow('0 1px 2px 0'),
    sm: shadow('0 1px 3px 0', '0 1px 2px -1px'),
    md: shadow('0 4px 6px -1px', '0 2px 4px -2px'),
    lg: shadow('0 10px 15px -3px', '0 4px 6px -4px'),
    xl: shadow('0 20px 25px -5px', '0 8px 10px -6px'),
    inset: shadow('inset 0 2px 4px 0'),
  },
  breakpoint: {
    sm: '(min-width: 40rem)',
    md: '(min-width: 48rem)',
    lg: '(min-width: 64rem)',
    xl: '(min-width: 80rem)',
  },
})

export type Tokens = typeof tokens

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

/**
 * The non-color scales a design system shares across themes. Space and
 * radius multiply by the `density` and `radius-factor` knobs, so a compact
 * or a rounder theme is one override. `breakpoint` is the record
 * `Style.responsive` takes; `breakpointWidths` gives the same names as pixel
 * thresholds for `foldkit-primitives/media` Breakpoints.
 */
import { DiagnosticError } from '../diagnostics.js'
import { define } from './core.js'

const space = (rem: number) => `calc(${rem}rem * var(--fk-knob-density))`
const radius = (px: number) => `calc(${px}px * var(--fk-knob-radius-factor))`

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
  breakpoint: {
    sm: '(min-width: 40rem)',
    md: '(min-width: 48rem)',
    lg: '(min-width: 64rem)',
    xl: '(min-width: 80rem)',
  },
})

export type Tokens = typeof tokens

const MIN_WIDTH = /^\(min-width:\s*(\d+(?:\.\d+)?)(rem|px)\)$/

/**
 * Each breakpoint query's `min-width` in pixels (rem at 16), so CSS and the
 * Model agree on what `md` means. A query that is not a plain `min-width`
 * is refused: it has no single threshold.
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

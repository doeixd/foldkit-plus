/**
 * A unitless ratio for fluid sizes: where the viewport sits between two
 * boundaries, 0 at `min` and 1 at `max`. The expression is
 * `tan(atan2(y, x))`, which is exactly `y / x`; `atan2` alone returns an angle
 * and is not linear. `progress()` returns the same number but raises the
 * browser floor above the one the palette already needs, so the exact
 * fallback is the shipped form.
 */
import { DiagnosticError } from '../diagnostics.js'

/** The smallest and largest viewport a fluid value spans, in `px`. */
export interface Viewport {
  readonly min: string
  readonly max: string
}

export type FluidTypeOptions =
  | {
      /** The value at the small viewport, e.g. `'1.75rem'`. */
      readonly min: string
      /** The value at the large viewport, e.g. `'2.5rem'`. */
      readonly max: string
      /** A range of its own; the theme's range is used when omitted. */
      readonly viewport?: Viewport
      readonly container?: false
    }
  | {
      readonly min: string
      readonly max: string
      /** Measure the theme's range on the nearest inline-size container. */
      readonly container: true
      readonly viewport?: never
    }

/** The growth of a type step at the large end: every step over the body grows a little more. */
export const FLUID_BASE = 0.06
export const FLUID_RATIO = 1.15

const PX = /^(\d+(?:\.\d+)?)px$/

const px = (value: string, which: 'min' | 'max'): number => {
  const match = PX.exec(value.trim())
  if (match === null) {
    throw new DiagnosticError({
      source: 'theme',
      code: 'theme:fluid-boundary',
      severity: 'error',
      message: `Fluid viewport ${which} is "${value}", not a px length`,
      details: { which, value },
    })
  }
  return Number(match[1])
}

/**
 * `clamp(0, tan(atan2(100vw - min, max - min)), 1)`: the viewport's place in
 * `min..max`, linear and clamped. `min` and `max` are CSS lengths, so the
 * tokens pass the viewport knobs' variables and `fluidRatio` passes concrete
 * pixels through the same expression.
 */
export const fluidRatioOf = (min: string, max: string, measure = '100vw'): string =>
  `clamp(0, tan(atan2(${measure} - ${min}, ${max} - ${min})), 1)`

/** The theme's range measured on the nearest inline-size container. */
export const containerFluidRatio = (): string =>
  fluidRatioOf('var(--fk-knob-fluid-viewport-min)', 'var(--fk-knob-fluid-viewport-max)', '100cqw')

/** `containerFluidRatio()` at the theme's strength, for `--fk-fluid-progress` on a container's content. */
export const containerFluidProgress = (): string =>
  `calc(${containerFluidRatio()} * var(--fk-knob-fluid))`

/** The ratio for a checked `px` range; see `fluidRatioOf`. */
export const fluidRatio = (viewport: Viewport): string => {
  const min = px(viewport.min, 'min')
  const max = px(viewport.max, 'max')
  if (min >= max) {
    throw new DiagnosticError({
      source: 'theme',
      code: 'theme:fluid-range',
      severity: 'error',
      message: `Fluid viewport min (${viewport.min}) must be less than max (${viewport.max})`,
      details: { min, max },
    })
  }
  return fluidRatioOf(`${min}px`, `${max}px`)
}

/**
 * `min` at the small viewport, `max` at the large one, by the theme's fluid
 * strength: `calc(min + (max - min) * var(--fk-fluid-progress))`. A still theme
 * (`type.fluid: 0`) gives `min` everywhere.
 */
export const fluidType = (options: FluidTypeOptions): string => {
  const progress =
    options.container === true
      ? containerFluidProgress()
      : options.viewport === undefined
        ? 'var(--fk-fluid-progress)'
        : `calc(${fluidRatio(options.viewport)} * var(--fk-knob-fluid))`
  return `calc(${options.min} + (${options.max} - ${options.min}) * ${progress})`
}

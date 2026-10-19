/**
 * Knobs: the typed inputs a theme sets. Each knob is a Schema for the value
 * a theme writes, the CSS variables that value writes, and what those
 * variables hold when no theme sets it (its default, or the expression it
 * follows). Every token derives from knob variables, so a theme is only its
 * knob values (`docs/theme-knobs.md`).
 */
import { Schema } from 'effect'

/** A knob's variables, by the name after `--fk-knob-`, each a CSS value. */
export type Variables = Readonly<Record<string, string>>

/** How a knob is drawn as a control: a range for a number, a choice of options, a font stack. */
export type Control =
  | {
      readonly kind: 'range'
      readonly min: number
      readonly max: number
      readonly step: number
      readonly unit: string
    }
  | { readonly kind: 'choice'; readonly options: ReadonlyArray<string> }
  | { readonly kind: 'font' }

export interface Knob<Value> {
  readonly schema: Schema.Codec<Value>
  /** The variables a value writes; a method, so a knob of any value is a `Knob<unknown>`. */
  write(value: Value): Variables
  /** What the variables hold when no theme sets the knob. */
  readonly unset: Variables
  /** What the knob does, in a sentence: a control's tooltip. */
  readonly description: string
  readonly control: Control
}

/** A computed number without float noise: `0.02`, not `0.019999999999999997`. */
const num = (value: number) => String(Number(value.toFixed(4)))

interface Range {
  /** The variable it writes, the name after `--fk-knob-`. */
  readonly variable: string
  readonly default: number
  /** A CSS expression it holds while unset, in place of `default` (`var(--fk-knob-accent-h)`). */
  readonly follows?: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly description: string
}

/** A number written with `unit` after it, refused outside `min` to `max`. */
const ranged =
  (unit: string) =>
  (options: Range): Knob<number> => ({
    schema: Schema.Number.check(Schema.isBetween({ minimum: options.min, maximum: options.max })),
    write: value => ({ [options.variable]: `${num(value)}${unit}` }),
    unset: { [options.variable]: options.follows ?? `${num(options.default)}${unit}` },
    description: options.description,
    control: { kind: 'range', min: options.min, max: options.max, step: options.step, unit },
  })

/** A plain number: a multiplier, a chroma. */
export const number = ranged('')
/** A number of degrees around the hue wheel. */
export const angle = (
  options: Omit<Range, 'min' | 'max' | 'step'> & Partial<Pick<Range, 'min' | 'max' | 'step'>>,
) => number({ min: -360, max: 360, step: 1, ...options })
/** A percentage, written with `%`. */
export const percent = ranged('%')
/** A length in `unit`, written with it (`1px`, `-0.025em`). */
export const length = (unit: 'px' | 'em' | 'rem') => ranged(unit)

/**
 * A value per scheme: `{ light, dark }`, or a bare value for the light scheme
 * alone, the dark keeping its default (a theme's accent lightness rarely
 * suits a dark page). `dark` is the knob for the dark variable.
 */
export const schemed = (
  light: Knob<number>,
  dark: Knob<number>,
): Knob<number | { readonly light?: number; readonly dark?: number }> => ({
  schema: Schema.Union([
    light.schema,
    Schema.Struct({
      light: Schema.optionalKey(light.schema),
      dark: Schema.optionalKey(dark.schema),
    }),
  ]),
  write: value =>
    typeof value === 'number'
      ? light.write(value)
      : {
          ...(value.light === undefined ? {} : light.write(value.light)),
          ...(value.dark === undefined ? {} : dark.write(value.dark)),
        },
  unset: { ...light.unset, ...dark.unset },
  description: light.description,
  control: light.control,
})

/**
 * One of `options`, each the variables it writes: choosing `spring` writes
 * the ease variable as `var(--fk-motion-spring)`. Every option names the
 * same variables, so switching writes each again.
 */
export const choice = <const Options extends Readonly<Record<string, Variables>>>(options: {
  readonly default: keyof Options & string
  readonly options: Options
  readonly description: string
}): Knob<keyof Options & string> => {
  const names = Object.keys(options.options) as ReadonlyArray<keyof Options & string>
  return {
    schema: Schema.Literals(names),
    write: value => options.options[value]!,
    unset: options.options[options.default]!,
    description: options.description,
    control: { kind: 'choice', options: names },
  }
}

/** A font stack: any non-empty CSS `font-family` value. */
export const font = (options: {
  readonly variable: string
  readonly default: string
  readonly follows?: string
  readonly description: string
}): Knob<string> => ({
  schema: Schema.NonEmptyString,
  write: value => ({ [options.variable]: value }),
  unset: { [options.variable]: options.follows ?? options.default },
  description: options.description,
  control: { kind: 'font' },
})

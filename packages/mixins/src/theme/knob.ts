/**
 * Knobs: the typed inputs a theme sets. Each knob is a Schema for the value
 * a theme writes, the CSS variables that value writes, and what those
 * variables hold when no theme sets it (its default, or the expression it
 * follows). Every token derives from knob variables, so a theme is only its
 * knob values (`docs/theme-knobs.md`).
 */
import { Schema } from 'effect'

/** A knob's variables, by the name after `--fk-knob-`, each a CSS value. */
export type Variables<Names extends string = string> = Readonly<Record<Names, string>>

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

/**
 * A knob of `Value` writing the variables `Names`. `write` gives those a
 * value sets (a light-only value leaves the dark one out); `unset` gives
 * every one, as no theme set it.
 */
export interface Knob<Value, Names extends string = string> {
  readonly schema: Schema.Codec<Value>
  /** A method, so a knob of any value is a `Knob<unknown>`. */
  write(value: Value): Readonly<Partial<Record<Names, string>>>
  readonly unset: Variables<Names>
  /** The value it stands at unset: a control's starting point. */
  readonly default: Value
  /** What the knob is called: a control's label. */
  readonly title: string
  /** What the knob does, in a sentence: a control's tooltip. */
  readonly description: string
  readonly control: Control
}

/** A computed number without float noise: `0.02`, not `0.019999999999999997`. */
const num = (value: number) => String(Number(value.toFixed(4)))

interface Range<Name extends string> {
  /** The variable it writes, the name after `--fk-knob-`. */
  readonly variable: Name
  readonly default: number
  /** A CSS expression it holds while unset, in place of `default` (`var(--fk-hue-accent)`). */
  readonly follows?: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly title: string
  readonly description: string
}

/** `{ [name]: value }` with its one key's name kept in its type. */
const one = <Name extends string>(name: Name, value: string) =>
  ({ [name]: value }) as Variables<Name>

/** A number written with `unit` after it, refused outside `min` to `max`. */
const ranged =
  (unit: string) =>
  <const Name extends string>(options: Range<Name>): Knob<number, Name> => ({
    schema: Schema.Number.check(Schema.isBetween({ minimum: options.min, maximum: options.max })),
    write: value => one(options.variable, `${num(value)}${unit}`),
    unset: one(options.variable, options.follows ?? `${num(options.default)}${unit}`),
    default: options.default,
    title: options.title,
    description: options.description,
    control: { kind: 'range', min: options.min, max: options.max, step: options.step, unit },
  })

/** A plain number: a multiplier, a chroma. */
export const number = ranged('')
/** A number of degrees around the hue wheel. */
export const angle = <const Name extends string>(
  options: Omit<Range<Name>, 'min' | 'max' | 'step'> &
    Partial<Pick<Range<Name>, 'min' | 'max' | 'step'>>,
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
export const schemed = <Light extends string, Dark extends string>(
  light: Knob<number, Light>,
  dark: Knob<number, Dark>,
): Knob<number | { readonly light?: number; readonly dark?: number }, Light | Dark> => ({
  schema: Schema.Union([
    light.schema,
    Schema.Struct({
      light: Schema.optionalKey(light.schema),
      dark: Schema.optionalKey(dark.schema),
    }),
  ]),
  // Light's variables, dark's, or both: each a partial record of the two
  // (TypeScript does not widen a record over generic keys by itself).
  write: value =>
    (typeof value === 'number'
      ? light.write(value)
      : {
          ...(value.light === undefined ? {} : light.write(value.light)),
          ...(value.dark === undefined ? {} : dark.write(value.dark)),
        }) as Readonly<Partial<Record<Light | Dark, string>>>,
  unset: { ...light.unset, ...dark.unset },
  default: { light: light.default, dark: dark.default },
  title: light.title,
  description: light.description,
  control: light.control,
})

/** A choice's options: every one writes the same variables. */
type Options = Readonly<Record<string, Variables>>

/** The variables every option of `O` writes. */
type Written<O extends Options> = keyof O[keyof O] & string

/** A knob that is one of its `options`, each in full, as `write` gives a chosen one. */
export interface Choice<O extends Options> extends Knob<keyof O & string, Written<O>> {
  readonly options: { readonly [K in keyof O]: Variables<Written<O>> }
}

/**
 * One of `options`, each the variables it writes: choosing `spring` writes
 * the ease variable as `var(--fk-motion-spring)`. Every option names the
 * same variables, so switching writes each again.
 */
export const choice = <const O extends Options>(options: {
  readonly default: keyof O & string
  readonly options: O
  readonly title: string
  readonly description: string
}): Choice<O> => {
  const names = Object.keys(options.options) as ReadonlyArray<keyof O & string>
  return {
    schema: Schema.Literals(names),
    write: value => options.options[value]!,
    unset: options.options[options.default]!,
    options: options.options,
    default: options.default,
    title: options.title,
    description: options.description,
    control: { kind: 'choice', options: names },
  }
}

/** A font stack: any non-empty CSS `font-family` value. */
export const font = <const Name extends string>(options: {
  readonly variable: Name
  readonly default: string
  readonly follows?: string
  readonly title: string
  readonly description: string
}): Knob<string, Name> => ({
  schema: Schema.NonEmptyString,
  write: value => one(options.variable, value),
  unset: one(options.variable, options.follows ?? options.default),
  default: options.default,
  title: options.title,
  description: options.description,
  control: { kind: 'font' },
})

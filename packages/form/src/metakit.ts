/**
 * `foldkit-form/metakit` — a form reading what a metakit declaration already
 * says: the input attributes its Schema's bounds and domain types imply, and
 * whether a guarded `Transition` would go through with the values entered so
 * far. A subpath: the main entry imports no metakit module, so a page with a
 * form and no metakit keeps none of it.
 */
import { Match, Option, Result, type Schema } from 'effect'
import { Transition, type Expr, type Verdict } from 'metakit'
import { CalendarDay, Decimal, type Domain } from 'metakit/domain'
import { fieldSpecs, type FieldSpec } from 'metakit/inspect'
import { Input, type Control } from './input.js'

/**
 * What an HTML `<input>` takes from a key's declaration. Each is none when the
 * declaration says nothing about it, and `type` is none when the control's own
 * type stands (text, a checkbox, a select).
 */
export interface InputAttributes {
  readonly type: Option.Option<'number' | 'date'>
  readonly inputMode: Option.Option<'numeric' | 'decimal'>
  /** The lowest value as the control shows it: a day as `YYYY-MM-DD`, an amount in whole units. */
  readonly min: Option.Option<string>
  readonly max: Option.Option<string>
  readonly step: Option.Option<string>
}

/**
 * One key's declaration as `Inspect.fieldSpecs` reads it from the input's
 * Schema (its bounds, literals and domain type), with the input attributes
 * that follow from it.
 */
export interface Constraint<Key extends string> extends Omit<FieldSpec, 'name'> {
  readonly key: Key
  readonly attributes: InputAttributes
}

/** What `Declared.of` reads from a form: its input Schema, and what of it decodes as it stands. */
export interface DeclaredForm<Fields extends Schema.Struct.Fields, Model> {
  readonly input: { readonly schema: Schema.Struct<Fields> }
  readonly partial: (model: Model) => Partial<Schema.Struct.Type<Fields>>
}

/** A form's declarations, read once from its input Schema. */
export interface Declarations<Fields extends Schema.Struct.Fields, Model> {
  /** Each key's constraint, by key. */
  readonly constraints: { readonly [K in keyof Fields & string]: Constraint<K> }
  /**
   * Whether `transition` would go through with the values entered so far as
   * its input, and `state` (the part of it known) as its state: `True` or
   * `False` once the values its guard reads are known, `Unknown` while one is
   * missing or not valid yet, or the guard calls an opaque function.
   */
  readonly can: <State, Emit>(
    model: Model,
    transition: Transition.Transition<State, Schema.Struct.Type<Fields>, Emit>,
    state?: Expr.PartialEnv<State>,
  ) => Verdict.Verdict<never>
}

/** A domain type held as whole units at a scale: an amount of money, or a decimal. */
type Scaled = Extract<Domain.DomainMetadata, { readonly kind: 'money' | 'decimal' }>

/** The text of `units` units at `scale`: `1250` at scale 2 is `12.50`. */
const unitsText = (units: number, scale: number): string =>
  // A brand of metakit's own, which only its constructors give.
  Decimal.format(units as Decimal.DecimalValue<number>, { scale })

const dayText = (day: number): string => CalendarDay.toIso(day as CalendarDay.CalendarDayValue)

/**
 * A control for a `CalendarDay` key: the draft is the day as `YYYY-MM-DD`, what
 * an `<input type="date">` holds, and the value the epoch day it names.
 */
const CalendarDayInput = Input.kind('CalendarDay', {
  draft: 'text',
  parse: draft => Result.getOrUndefined(CalendarDay.fromIso(draft)),
  format: value => dayText(Number(value)),
  unparsed: 'Enter a date',
})

/**
 * A control for a `Money` or `Decimal` key: the draft is the amount in whole
 * units (`12.50`), and the value the integer count of units at the domain's
 * scale (`1250`). More fractional digits than the scale do not read.
 */
const DecimalInput = Input.kind<Scaled>('Decimal', {
  draft: 'text',
  parse: (draft, { scale }) => Result.getOrUndefined(Decimal.parse(draft, { scale })),
  format: (value, { scale }) => unitsText(Number(value), scale),
  unparsed: 'Enter an amount',
})

/** The tighter of two bounds, either of which may be absent. */
const tighter = (
  a: Option.Option<number>,
  b: Option.Option<number>,
  pick: (x: number, y: number) => number,
): Option.Option<number> =>
  Option.match(a, {
    onNone: () => b,
    onSome: x => Option.some(Option.match(b, { onNone: () => x, onSome: y => pick(x, y) })),
  })

/**
 * The inclusive bounds of a key held as whole numbers, an exclusive bound made
 * inclusive: above 0 is at least 1. HTML has no exclusive bound, so a key that
 * is not whole keeps only its inclusive ones, and its exclusive ones are left
 * to validation.
 */
const bounds = (
  spec: FieldSpec,
  whole: boolean,
): { readonly min: Option.Option<number>; readonly max: Option.Option<number> } =>
  whole
    ? {
        min: tighter(
          Option.map(spec.min, Math.ceil),
          Option.map(spec.exclusiveMin, n => Math.floor(n) + 1),
          Math.max,
        ),
        max: tighter(
          Option.map(spec.max, Math.floor),
          Option.map(spec.exclusiveMax, n => Math.ceil(n) - 1),
          Math.min,
        ),
      }
    : { min: spec.min, max: spec.max }

const numeric = (
  spec: FieldSpec,
  whole: boolean,
  text: (n: number) => string,
  rest: Pick<InputAttributes, 'type' | 'inputMode' | 'step'>,
): InputAttributes => {
  const { min, max } = bounds(spec, whole)
  return { ...rest, min: Option.map(min, text), max: Option.map(max, text) }
}

const none: InputAttributes = {
  type: Option.none(),
  inputMode: Option.none(),
  min: Option.none(),
  max: Option.none(),
  step: Option.none(),
}

const attributesOf = (spec: FieldSpec): InputAttributes =>
  Option.match(spec.domain, {
    onNone: () =>
      spec.kind === 'integer'
        ? numeric(spec, true, String, {
            type: Option.some('number'),
            inputMode: Option.some('numeric'),
            step: Option.some('1'),
          })
        : spec.kind === 'number'
          ? numeric(spec, false, String, {
              type: Option.some('number'),
              inputMode: Option.some('decimal'),
              // A number input's default step is 1, which marks 1.5 as invalid.
              step: Option.some('any'),
            })
          : none,
    onSome: domain =>
      Match.value(domain).pipe(
        Match.discriminatorsExhaustive('kind')({
          calendarDay: () =>
            numeric(spec, true, dayText, {
              type: Option.some('date'),
              inputMode: Option.none(),
              step: Option.none(),
            }),
          money: ({ scale }) => scaledAttributes(spec, scale),
          decimal: ({ scale }) => scaledAttributes(spec, scale),
          orderedEnum: () => none,
          currency: () => none,
        }),
      ),
  })

const scaledAttributes = (spec: FieldSpec, scale: number): InputAttributes =>
  numeric(spec, true, units => unitsText(units, scale), {
    type: Option.some('number'),
    inputMode: Option.some(scale === 0 ? 'numeric' : 'decimal'),
    step: Option.some(unitsText(1, scale)),
  })

/**
 * The controls a Schema's domain types call for, by key: `Declared.CalendarDay`
 * for a `CalendarDay`, `Declared.Decimal` for `Money` and `Decimal`. Give them
 * to `Form.make` under `inputs`; a control named after them for the same key
 * replaces the derived one.
 */
const inputs = <Fields extends Schema.Struct.Fields>(
  schema: Schema.Struct<Fields>,
): { readonly [K in keyof Fields]?: Control } =>
  // `Object.fromEntries` forgets the keys, which are the Schema's own.
  Object.fromEntries(
    fieldSpecs(schema).flatMap(spec =>
      Option.match(Option.flatMap(spec.domain, controlFor), {
        onNone: () => [],
        onSome: control => [[spec.name, control] as const],
      }),
    ),
  ) as { readonly [K in keyof Fields]?: Control }

const controlFor = (domain: Domain.DomainMetadata): Option.Option<Control> =>
  Match.value(domain).pipe(
    Match.discriminatorsExhaustive('kind')({
      calendarDay: (): Option.Option<Control> => Option.some(CalendarDayInput.of({})),
      money: scaled => Option.some(DecimalInput.of(scaled)),
      decimal: scaled => Option.some(DecimalInput.of(scaled)),
      orderedEnum: () => Option.none(),
      currency: () => Option.none(),
    }),
  )

/**
 * A form's declarations: each key's constraint, read once here, and whether a
 * guarded transition would go through with the values entered so far.
 */
const of = <Fields extends Schema.Struct.Fields, Model>(
  form: DeclaredForm<Fields, Model>,
): Declarations<Fields, Model> => {
  const constraints = Object.fromEntries(
    fieldSpecs(form.input.schema).map(spec => {
      const { name, ...read } = spec
      return [name, { ...read, key: name, attributes: attributesOf(spec) }]
    }),
  ) as Declarations<Fields, Model>['constraints']
  return {
    constraints,
    can: (model, transition, state) =>
      Transition.can(transition, {
        // A value with keys missing is a value with parts unknown; TypeScript
        // cannot see that a shallow `Partial` of a type fits its deep partial.
        input: form.partial(model) as Expr.PartialEnv<Schema.Struct.Type<Fields>>,
        ...(state === undefined ? {} : { state }),
      }),
  }
}

export const Declared = {
  of,
  inputs,
  /** The control `inputs` gives a `CalendarDay` key, for a renderer to recognise (`Declared.CalendarDay.is`). */
  CalendarDay: CalendarDayInput,
  /** The control `inputs` gives a `Money` or `Decimal` key; its data is the domain's, scale included. */
  Decimal: DecimalInput,
}

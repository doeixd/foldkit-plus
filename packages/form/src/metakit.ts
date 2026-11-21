/**
 * `foldkit-form/metakit` — a form reading what a metakit declaration already
 * says: the input attributes its Schema's bounds and domain types imply, and
 * whether a guarded `Transition` would go through with the values entered so
 * far, and which of its rules over several keys those values break. A
 * subpath: the main entry imports no metakit module, so a page with a
 * form and no metakit keeps none of it.
 */
import { Array as Arr, Match, Option, Result, type Schema } from 'effect'
import * as FieldValidation from 'foldkit/fieldValidation'
import { Expr, Transition, Verdict } from 'metakit'
import { CalendarDay, Decimal, type Domain } from 'metakit/domain'
import { fieldSpecs, type FieldSpec } from 'metakit/inspect'
import { Input, type Control, type Draft } from './input.js'

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

/**
 * What `Declared.of` reads from a form: its input Schema, what of it decodes as
 * it stands, and one key's state as a view shows it.
 */
export interface DeclaredForm<Fields extends Schema.Struct.Fields, Model, FieldKey extends string> {
  readonly input: { readonly schema: Schema.Struct<Fields> }
  readonly partial: (model: Model) => Partial<Schema.Struct.Type<Fields>>
  readonly field: (model: Model, key: FieldKey) => FieldValidation.Field<Draft>
}

/** A rule over several keys of the input that the values entered so far break. */
export interface RuleFailure<Fields extends Schema.Struct.Fields> {
  /** The keys of the form the rule reads: where a view shows it. None when it names none. */
  readonly keys: ReadonlyArray<keyof Fields & string>
  /** The rule itself, as `Expr.refine` wrote it on the input Schema. */
  readonly rule: Expr.Expr<Schema.Struct.Type<Fields>, boolean>
  /** The message given with the rule, if any. */
  readonly message: Option.Option<string>
}

/** What `Declared.of` takes beside the form. */
export interface DeclaredOptions<Fields extends Schema.Struct.Fields> {
  /**
   * The words `field` shows for a broken rule given no message. Needed when the
   * input has such a rule: `Declared.of` refuses one it would show as nothing.
   */
  readonly unworded?: (failure: RuleFailure<Fields>) => string
}

/** A form's declarations, read once from its input Schema. */
export interface Declarations<Fields extends Schema.Struct.Fields, Model, FieldKey extends string> {
  /** Each key's constraint, by key. */
  readonly constraints: { readonly [K in keyof Fields & string]: Constraint<K> }
  /**
   * Whether `transition` would go through with the values entered so far as
   * its input, and `state` (the part of it known) as its state: `True` or
   * `False` once the values its guard reads are known, `Unknown` while one is
   * missing or not valid yet, or the guard calls an opaque function. `False`
   * too for known values the guard cannot be evaluated over (a sum past
   * ±(2^53−1)): the transition refuses them.
   */
  readonly can: <State, Emit>(
    model: Model,
    transition: Transition.Transition<State, Schema.Struct.Type<Fields>, Emit>,
    state?: Expr.PartialEnv<State>,
  ) => Verdict.Verdict<never>
  /**
   * The input Schema's own rules over several keys (`Expr.refine` on the
   * struct) that the values entered so far break. A rule is broken only when
   * it is `False`, or cannot be evaluated over the values entered (the Schema
   * rejects those too): one reading a key not entered or not valid yet is
   * undecided, and not here. A rule on one key is that key's own validation,
   * which `form.field` already shows.
   */
  readonly failures: (model: Model) => ReadonlyArray<RuleFailure<Fields>>
  /**
   * `form.field`, made `Invalid` by each broken rule that reads `key`, its
   * message after the key's own errors, as the form shows its marks.
   */
  readonly field: (model: Model, key: FieldKey) => FieldValidation.Field<Draft>
}

/** A domain type held as whole units at a scale: an amount of money, or a decimal. */
type Scaled = Extract<Domain.DomainMetadata, { readonly kind: 'money' | 'decimal' }>

/** The text of `units` units at `scale`: `1250` at scale 2 is `12.50`. */
const unitsText = (units: number, scale: number): string =>
  // A brand of metakit's own, which only its constructors give.
  Decimal.format(units as Decimal.DecimalValue<number>, { scale })

/** The day as `YYYY-MM-DD`, or none for one outside years 0001 to 9999, which has no such text. */
const dayText = (day: number): string | undefined =>
  Result.getOrUndefined(CalendarDay.toIso(day as CalendarDay.CalendarDayValue))

/**
 * A control for a `CalendarDay` key: the draft is the day as `YYYY-MM-DD`, what
 * an `<input type="date">` holds, and the value the epoch day it names.
 */
const CalendarDayInput = Input.kind('CalendarDay', {
  draft: 'text',
  parse: draft => Result.getOrUndefined(CalendarDay.fromIso(draft)),
  format: value => dayText(Number(value)) ?? '',
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

/**
 * The inclusive bounds of a key held as whole numbers, an exclusive bound made
 * inclusive: above 0 is at least 1. `fieldSpecs` keeps one bound per side, the
 * tightest. HTML has no exclusive bound, so a key that is not whole keeps only
 * its inclusive ones, and its exclusive ones are left to validation.
 */
const bounds = (
  spec: FieldSpec,
  whole: boolean,
): { readonly min: Option.Option<number>; readonly max: Option.Option<number> } =>
  whole
    ? {
        min: Option.orElse(Option.map(spec.min, Math.ceil), () =>
          Option.map(spec.exclusiveMin, n => Math.floor(n) + 1),
        ),
        max: Option.orElse(Option.map(spec.max, Math.floor), () =>
          Option.map(spec.exclusiveMax, n => Math.ceil(n) - 1),
        ),
      }
    : { min: spec.min, max: spec.max }

const numeric = (
  spec: FieldSpec,
  whole: boolean,
  text: (n: number) => string | undefined,
  rest: Pick<InputAttributes, 'type' | 'inputMode' | 'step'>,
): InputAttributes => {
  const { min, max } = bounds(spec, whole)
  const shown = (n: number) => Option.fromUndefinedOr(text(n))
  return { ...rest, min: Option.flatMap(min, shown), max: Option.flatMap(max, shown) }
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
 * to `Form.make` under `inputs`; a control given for the same key after them
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
 * A verdict with a refused evaluation made `False`. metakit refuses to
 * evaluate some known values (an integer result past ±(2^53−1)) and judges
 * that `Unknown`, with a `refused` obligation; a value not known yet is
 * `Unknown` with another. The first is decided: the Schema's rule and
 * `Transition.step` reject those values, whatever is entered later.
 */
const refusedIsFalse = (verdict: Verdict.Verdict<never>): Verdict.Verdict<never> =>
  Verdict.isUnknown(verdict) && Option.exists(verdict.obligation, ({ kind }) => kind === 'refused')
    ? Verdict.False()
    : verdict

/**
 * A form's declarations: each key's constraint and the input's rules over
 * several keys, read once here; whether a guarded transition would go through
 * with the values entered so far; and which of those rules they break.
 */
const of = <Fields extends Schema.Struct.Fields, Model, FieldKey extends string>(
  form: DeclaredForm<Fields, Model, FieldKey>,
  options: DeclaredOptions<Fields> = {},
): Declarations<Fields, Model, FieldKey> => {
  type Key = keyof Fields & string
  type Value = Schema.Struct.Type<Fields>
  const { schema } = form.input
  const constraints = Object.fromEntries(
    fieldSpecs(schema).map(spec => {
      const { name, ...read } = spec
      return [name, { ...read, key: name, attributes: attributesOf(spec) }]
    }),
  ) as Declarations<Fields, Model, FieldKey>['constraints']

  const isKey = (name: string | undefined): name is Key =>
    name !== undefined && Object.hasOwn(schema.fields, name)
  // Each rule with the words `field` shows for it, decided here: they depend on the rule alone.
  const rules = Expr.rulesOf(schema)
    .filter(({ at }) => at.length === 0)
    .map(({ expr, message }) => {
      const failure: RuleFailure<Fields> = {
        rule: expr,
        message,
        // An opaque term with no declared reads names no key; it is shown on none.
        keys: Option.match(Expr.reads(expr), {
          onNone: (): ReadonlyArray<Key> => [],
          // Two paths into one key (a control backed by a Bundle holding a struct) name it once.
          onSome: paths => Arr.dedupe(paths.map(path => path[0]).filter(isKey)),
        }),
      }
      const words = Option.orElse(message, () =>
        Option.map(Option.fromUndefinedOr(options.unworded), say => say(failure)),
      )
      return Option.match(words, {
        onNone: () => {
          throw new Error(
            `Declared.of: the rule ${Expr.show(expr)} has no message; give it one (\`Expr.refine(…, { message })\`) or pass \`unworded\``,
          )
        },
        onSome: text => ({ failure, text }),
      })
    })

  // A value with keys missing is a value with parts unknown; TypeScript cannot
  // see that a shallow `Partial` of a type fits its deep partial.
  const known = (model: Model) => form.partial(model) as Expr.PartialEnv<Value>

  // A view asks `field` once per key of one Model: judge the rules once per Model.
  let last: Option.Option<{ readonly model: Model; readonly broken: typeof rules }> = Option.none()
  const broken = (model: Model): typeof rules => {
    if (Option.isSome(last) && last.value.model === model) return last.value.broken
    const values = known(model)
    const found = rules.filter(({ failure }) =>
      Verdict.isFalse(refusedIsFalse(Expr.judge(failure.rule, values))),
    )
    last = Option.some({ model, broken: found })
    return found
  }

  return {
    constraints,
    can: (model, transition, state) =>
      refusedIsFalse(
        Transition.can(transition, {
          input: known(model),
          ...(state === undefined ? {} : { state }),
        }),
      ),
    failures: model => broken(model).map(({ failure }) => failure),
    field: (model, key) => {
      const field = form.field(model, key)
      const said = broken(model)
        .filter(({ failure }) => failure.keys.some(each => each === key))
        .map(({ text }) => text)
      if (!Arr.isReadonlyArrayNonEmpty(said)) return field
      const own = FieldValidation.match(field, {
        onNotValidated: (): ReadonlyArray<string> => [],
        onValidating: () => [],
        onValid: () => [],
        onInvalid: ({ errors }) => errors,
      })
      return FieldValidation.Invalid({ value: field.value, errors: Arr.appendAll(own, said) })
    },
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

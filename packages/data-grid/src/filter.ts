import { Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { CellEditor } from './columns.js'

/** A local calendar day, `YYYY-MM-DD`, as a date input reads it. */
const Day = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))

/**
 * What one column is filtered by: the application's to hold and to apply.
 * One variant per kind of column: text `Contains`, a number `Range`, a choice
 * `OneOf`, a checkbox `Is`, a date `Between`. A filter that keeps every row
 * is never one of these: it is none.
 */
export const ColumnFilter = defineTaggedUnion({
  /** The text holds this, folding ASCII case, as `Expr.contains` does. */
  Contains: { text: Schema.String },
  /** At least `min`, at most `max`, each when given. */
  Range: {
    min: Schema.OptionFromNullOr(Schema.Finite),
    max: Schema.OptionFromNullOr(Schema.Finite),
  },
  /** One of these literals. */
  OneOf: { options: Schema.Array(Schema.String) },
  Is: { checked: Schema.Boolean },
  /** On or after `from`, on or before `to`: local days, each when given. */
  Between: { from: Schema.OptionFromNullOr(Day), to: Schema.OptionFromNullOr(Day) },
})
export type ColumnFilter = typeof ColumnFilter.Type

type Contains = typeof ColumnFilter.Contains.Type
type Range = typeof ColumnFilter.Range.Type
type Is = typeof ColumnFilter.Is.Type
type Between = typeof ColumnFilter.Between.Type
/** A choice's filter, its options the column's own literals. */
export type OneOf<V extends string> = {
  readonly _tag: 'OneOf'
  readonly options: ReadonlyArray<V>
}

type IsTextLiteral<M> = M extends string
  ? string extends M
    ? false
    : // A template literal or a branded string keys an index signature, which `{}` fits.
      {} extends Record<M, 1>
      ? false
      : true
  : false
type AllTextLiterals<V> = [V] extends [string]
  ? false extends (V extends unknown ? IsTextLiteral<V> : never)
    ? false
    : true
  : false
/** What `filterKindOf` reads from a schema's decoded side, at the type level. */
export type KindOfValue<V> = [V] extends [boolean]
  ? 'Checkbox'
  : [V] extends [Date]
    ? 'Date'
    : [V] extends [number]
      ? 'Number'
      : AllTextLiterals<V> extends true
        ? 'Choice'
        : 'Text'
/** A column's filter kind, as the grid reads it at run time. */
export type FilterKind<Spec> = Spec extends { readonly filter: infer F }
  ? F extends true
    ? Spec extends { readonly edit: { readonly schema: Schema.Codec<infer V, string> } }
      ? KindOfValue<V>
      : 'Text'
    : F extends { readonly _tag: infer T }
      ? T
      : never
  : never
// Inferred in two steps: matched against `filter: true` and the schema at
// once, a spec that is an intersection (`GridCrud.columns`) infers `unknown`.
type ChoiceOf<Spec> = Spec extends { readonly filter: true }
  ? Spec extends { readonly edit: { readonly schema: Schema.Codec<infer V, string> } }
    ? V & string
    : string
  : string
/** The filter of a column, by its spec: the variant its kind takes. */
export type FilterOf<Spec> = {
  Text: Contains
  Number: Range
  Choice: OneOf<ChoiceOf<Spec>>
  Checkbox: Is
  Date: Between
}[FilterKind<Spec> & ('Text' | 'Number' | 'Choice' | 'Checkbox' | 'Date')]
/** What `keeps` reads from a row for a filter: a Range a number, a Between a `Date`. */
export type FilterValue<F> = F extends Contains
  ? string
  : F extends Range
    ? number
    : F extends OneOf<infer V>
      ? V
      : F extends Is
        ? boolean
        : F extends Between
          ? Date
          : never
/** The ids of the columns that filter. */
export type FilterableId<Specs> = {
  [K in keyof Specs]: Specs[K] extends { readonly filter: true | CellEditor } ? K : never
}[keyof Specs] &
  string
/** Every filterable column's filter, none where it filters nothing: the application's value. */
export type Filters<Specs> = {
  readonly [K in FilterableId<Specs>]: Option.Option<FilterOf<Specs[K]>>
}
/** What `Out.Filtered` carries: one case per filterable column, its filter that column's variant. */
export type FilterChange<Specs> = {
  [K in FilterableId<Specs>]: {
    readonly column: K
    readonly filter: Option.Option<FilterOf<Specs[K]>>
  }
}[FilterableId<Specs>]

/**
 * The stored form of one column's filter: its own variant, never one that
 * keeps every row, a choice only of its literals, each once, and bounds
 * that are finite numbers.
 */
export const filterSchemaOf = (kind: CellEditor): Schema.Codec<ColumnFilter, unknown> => {
  // A Range or a Between with neither bound keeps every row: that is none.
  const someBound = (a: Option.Option<unknown>, b: Option.Option<unknown>) =>
    Option.isSome(a) || Option.isSome(b)
  const schema: Schema.Top = CellEditor.match(kind, {
    Text: () =>
      Schema.TaggedStruct('Contains', { text: Schema.String.check(Schema.isMinLength(1)) }),
    Number: () =>
      ColumnFilter.Range.check(
        Schema.makeFilter<Range>(({ min, max }) => someBound(min, max), { expected: 'a bound' }),
      ),
    Choice: ({ options }) =>
      Schema.TaggedStruct('OneOf', {
        options: Schema.Array(Schema.Literals(options)).check(
          Schema.isMinLength(1),
          Schema.isUnique(),
        ),
      }),
    Checkbox: () => ColumnFilter.Is,
    Date: () =>
      ColumnFilter.Between.check(
        Schema.makeFilter<Between>(({ from, to }) => someBound(from, to), { expected: 'a bound' }),
      ),
  })
  // Each case decodes to its variant of `ColumnFilter`, from JSON.
  return schema as unknown as Schema.Codec<ColumnFilter, unknown>
}

/**
 * An open filter form as typed: each kind reads its own fields, and a bound
 * is text, so it holds `1.` while it is typed.
 */
export const FilterForm = Schema.Struct({
  text: Schema.String,
  min: Schema.String,
  max: Schema.String,
  options: Schema.Array(Schema.String),
  checked: Schema.Literals(['any', 'true', 'false']),
  from: Schema.String,
  to: Schema.String,
})
export type FilterForm = typeof FilterForm.Type

export const emptyForm: FilterForm = {
  text: '',
  min: '',
  max: '',
  options: [],
  checked: 'any',
  from: '',
  to: '',
}

const shown = (value: Option.Option<number | string>): string =>
  Option.match(value, { onNone: () => '', onSome: String })

/** The form a filter is drawn as; none is the empty form. */
export const formOf = (filter: Option.Option<ColumnFilter>): FilterForm =>
  Option.match(filter, {
    onNone: () => emptyForm,
    onSome: ColumnFilter.match({
      Contains: ({ text }) => ({ ...emptyForm, text }),
      Range: ({ min, max }) => ({ ...emptyForm, min: shown(min), max: shown(max) }),
      OneOf: ({ options }) => ({ ...emptyForm, options }),
      Is: ({ checked }) => ({
        ...emptyForm,
        checked: checked ? ('true' as const) : ('false' as const),
      }),
      Between: ({ from, to }) => ({ ...emptyForm, from: shown(from), to: shown(to) }),
    }),
  })

/** What a form reads as: a filter or none, unless a bound is no number; and whether its bounds cross. */
export interface FormReading {
  readonly filter: Option.Option<ColumnFilter>
  /** The bounds that are not numbers (or days): while any is, nothing is reported. */
  readonly invalid: ReadonlyArray<'min' | 'max' | 'from' | 'to'>
  /** The lower bound is above the upper: reported, and it keeps no row. */
  readonly crossed: boolean
}

const decimal = /^[+-]?(\d+(\.\d*)?|\.\d+)$/
const day = /^\d{4}-\d{2}-\d{2}$/
// A number as typed, and finite: 309 digits read as Infinity, which no Range stores.
const isNumber = (text: string): boolean => decimal.test(text) && Number.isFinite(Number(text))
const isDay = (text: string): boolean => day.test(text)
/** A bound as typed: none when empty, refused (the outer none) when it is not one. */
const bound = (
  text: string,
  accepts: (trimmed: string) => boolean,
): Option.Option<Option.Option<string>> => {
  const trimmed = text.trim()
  if (trimmed === '') return Option.some(Option.none())
  return accepts(trimmed) ? Option.some(Option.some(trimmed)) : Option.none()
}

/** A kind's form read as its filter. */
export const readForm = (kind: CellEditor, form: FilterForm): FormReading => {
  const none = { filter: Option.none(), invalid: [], crossed: false } as const
  const range = <F extends 'min' | 'from', T extends 'max' | 'to'>(
    lowField: F,
    highField: T,
    accepts: (trimmed: string) => boolean,
    make: (low: Option.Option<string>, high: Option.Option<string>) => ColumnFilter,
    above: (low: string, high: string) => boolean,
  ): FormReading => {
    const low = bound(form[lowField], accepts)
    const high = bound(form[highField], accepts)
    const invalid = [
      ...(Option.isNone(low) ? [lowField] : []),
      ...(Option.isNone(high) ? [highField] : []),
    ]
    if (Option.isNone(low) || Option.isNone(high)) return { ...none, invalid }
    if (Option.isNone(low.value) && Option.isNone(high.value)) return none
    const crossed =
      Option.isSome(low.value) &&
      Option.isSome(high.value) &&
      above(low.value.value, high.value.value)
    return { filter: Option.some(make(low.value, high.value)), invalid: [], crossed }
  }
  return CellEditor.match(kind, {
    Text: () =>
      form.text === ''
        ? none
        : { ...none, filter: Option.some(ColumnFilter.Contains({ text: form.text })) },
    Number: () =>
      range(
        'min',
        'max',
        isNumber,
        (min, max) =>
          ColumnFilter.Range({ min: Option.map(min, Number), max: Option.map(max, Number) }),
        (low, high) => Number(low) > Number(high),
      ),
    Choice: () =>
      form.options.length === 0
        ? none
        : { ...none, filter: Option.some(ColumnFilter.OneOf({ options: form.options })) },
    Checkbox: () =>
      form.checked === 'any'
        ? none
        : { ...none, filter: Option.some(ColumnFilter.Is({ checked: form.checked === 'true' })) },
    Date: () =>
      range(
        'from',
        'to',
        isDay,
        (from, to) => ColumnFilter.Between({ from, to }),
        (low, high) => low > high,
      ),
  })
}

/** Whether `test` holds of the value, or there is none to test. */
const unlessNone = <A>(value: Option.Option<A>, test: (a: A) => boolean): boolean =>
  Option.match(value, { onNone: () => true, onSome: test })

// ASCII only, as `Expr.contains` folds on every backend.
const fold = (text: string): string =>
  text.replace(/[A-Z]/g, letter => String.fromCharCode(letter.charCodeAt(0) + 32))

const localDay = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Whether one filter keeps a value read from a row. */
export const testOf = (filter: ColumnFilter): ((value: unknown) => boolean) =>
  ColumnFilter.match(filter, {
    Contains: ({ text }) => {
      const wanted = fold(text)
      return (value: unknown) => fold(value as string).includes(wanted)
    },
    Range:
      ({ min, max }) =>
      (value: unknown) =>
        unlessNone(min, low => (value as number) >= low) &&
        unlessNone(max, high => (value as number) <= high),
    OneOf: ({ options }) => {
      const among = new Set<unknown>(options)
      return (value: unknown) => among.has(value)
    },
    Is:
      ({ checked }) =>
      (value: unknown) =>
        value === checked,
    Between:
      ({ from, to }) =>
      (value: unknown) => {
        const date = value as Date
        if (Number.isNaN(date.getTime())) return false
        const at = localDay(date)
        return unlessNone(from, low => at >= low) && unlessNone(to, high => at <= high)
      },
  })

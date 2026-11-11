import { Schema, SchemaAST, SchemaGetter } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
/** What a column shows and where it starts out. Its id is its key in `Columns.define`. */
export interface ColumnSpec<Row, Value> {
  readonly header: string
  readonly value: (row: Row) => Value
  /** The region the column starts in; `ColumnLayout.initial` reads it. */
  readonly pinned?: 'start' | 'end'
  /** Whether the column starts hidden; `ColumnLayout.initial` reads it. */
  readonly hidden?: boolean
  /** Its width in pixels until resized. Default `Columns.defaultWidth`. */
  readonly width?: number
  /** The narrowest a resize makes it. Default `Columns.minWidth`. */
  readonly minWidth?: number
  /** The widest a resize makes it. Default no limit. */
  readonly maxWidth?: number
  /** Whether it can be resized. Default `true`. */
  readonly resizable?: boolean
  /** Whether it can be hidden. Default `true`. */
  readonly hideable?: boolean
  /**
   * Makes the column's cells editable. The grid holds the draft, commits it
   * only when the column's schema decodes it, and reports the committed text
   * as an `Edited` OutMessage; `matchEdit` reads its value back, and writing
   * it is the application's. A schema that decodes to a boolean
   * (`Columns.checkbox`) makes the cells checkboxes, toggled in place.
   */
  readonly edit?: ColumnEdit<Row, unknown>
}

export interface ColumnEdit<Row, Value = string> {
  /** The text an edit of a row's cell begins with. Default the value as a string. */
  readonly draft?: (row: Row) => string
  /**
   * What the text means: from the text typed to the column's value. A draft
   * is committed only when it decodes, and the failure's message is the
   * cell's error, so a check's own `message` is what a person reads. Default
   * any text, as itself.
   */
  readonly schema?: Schema.Codec<Value, string>
}

/**
 * How a cell's edit is drawn, read from its column's schema: a checkbox, a
 * choice of the literals its text may be, a number typed, or text.
 */
export const CellEditor = defineTaggedUnion({
  Text: {},
  /** The schema decodes to a number: typed with a decimal keypad on touch. */
  Number: {},
  /** The schema's text is one of these, offered in order. */
  Choice: { options: Schema.Array(Schema.String) },
  /** The schema decodes to a date: a native date field over the draft text. */
  Date: {},
  /**
   * The schema decodes to a boolean: a checkbox drawn from the column's
   * value, toggled in place (`EditToggled`); it opens no draft.
   */
  Checkbox: {},
})
export type CellEditor = typeof CellEditor.Type

/**
 * Whether a schema decodes to a date, found as Effect's own tools find it:
 * by the declaration's representation id. Only Date-ness is read here, never
 * the text format: committing decodes the draft through the schema, and a
 * refusal is the cell's error.
 */
const DATE_ID = 'effect/schema/Date'

const isDate = (ast: SchemaAST.AST): boolean => {
  if (!SchemaAST.isDeclaration(ast)) return false
  const representation: unknown = ast.annotations?.['representation']
  return (
    typeof representation === 'object' &&
    representation !== null &&
    'id' in representation &&
    representation.id === DATE_ID
  )
}

/** A column's editor, from its schema; a column with none edits text. */
export const editorOf = (schema: Schema.Top | undefined): CellEditor => {
  if (schema === undefined) return CellEditor.Text()
  const type = SchemaAST.toType(schema.ast)
  // Before the choice: `Columns.checkbox`'s text is the literals `true` and `false`.
  if (SchemaAST.isBoolean(type)) return CellEditor.Checkbox()
  const encoded = SchemaAST.toEncoded(schema.ast)
  if (SchemaAST.isUnion(encoded)) {
    const options = encoded.types.flatMap(member =>
      SchemaAST.isLiteral(member) && typeof member.literal === 'string' ? [member.literal] : [],
    )
    // Every member a text literal: anything else typed would be refused.
    if (options.length === encoded.types.length) return CellEditor.Choice({ options })
  }
  if (isDate(type)) return CellEditor.Date()
  return SchemaAST.isNumber(type) ? CellEditor.Number() : CellEditor.Text()
}

/** The ids of the columns that edit. */
export type EditableId<Specs> = {
  [K in keyof Specs]: Specs[K] extends { readonly edit: object } ? K : never
}[keyof Specs] &
  string

/** What an editable column's text decodes to: its schema's value, or the text. */
export type EditValue<Spec> = Spec extends {
  readonly edit: { readonly schema: Schema.Codec<infer Value, string> }
}
  ? Value
  : string

/**
 * A checkbox column's cells are drawn from its value, so a spec whose edit
 * decodes to a boolean must read a boolean from its row.
 */
export type CheckboxValues<Row, Specs> = {
  readonly [K in keyof Specs]: Specs[K] extends {
    readonly edit: { readonly schema: Schema.Codec<boolean, string> }
  }
    ? { readonly value: (row: Row) => boolean }
    : unknown
}

export interface Column<Row, Id extends string, Value> extends ColumnSpec<Row, Value> {
  readonly id: Id
}

type ValueOf<Spec> = Spec extends ColumnSpec<never, infer Value> ? Value : never

export type ColumnId<C> = C extends Columns<never, infer Specs> ? keyof Specs & string : never

/**
 * A grid's columns, keyed by stable id. Order, visibility and pinning live in
 * a `ColumnLayout`, so every reference to a column (focus, a selected range,
 * a saved width) names its id and survives a reorder.
 */
export interface Columns<Row, Specs extends Record<string, ColumnSpec<Row, unknown>>> {
  /** In definition order: the order `ColumnLayout.initial` starts from. */
  readonly ids: ReadonlyArray<keyof Specs & string>
  readonly byId: {
    readonly [Id in keyof Specs & string]: Column<Row, Id, ValueOf<Specs[Id]>>
  }
  /**
   * Type-only: the specs as written, so a grid made from these columns infers
   * each one exactly, its edit's schema included. Never set.
   */
  readonly Specs?: Specs
}

// Integer-like keys are enumerated before every other key, whatever the order
// they were written in, so `{ name, 2024 }` would put 2024 first.
const arrayIndex = /^(0|[1-9][0-9]*)$/

export const Columns = {
  /** The width of a column that names none. */
  defaultWidth: 120,
  /** The narrowest a column with no `minWidth` resizes to. */
  minWidth: 40,
  /**
   * A boolean as a cell's text, `true` or `false`: give it as a column's
   * `edit.schema` and the cells are checkboxes. Any schema from text to a
   * boolean does the same; this one reads what `textOf` writes.
   */
  checkbox: Schema.Literals(['true', 'false']).pipe(
    Schema.decodeTo(Schema.Boolean, {
      decode: SchemaGetter.transform(text => text === 'true'),
      encode: SchemaGetter.transform(value => (value ? 'true' : 'false')),
    }),
  ),
  /** A value as a cell shows it: nothing for `null` or `undefined`. */
  textOf: (value: unknown): string => (value === null || value === undefined ? '' : String(value)),
  /**
   * Declares a grid's columns over `Row`. Call it twice, once with the row
   * type and once with the specs, so the ids and values are inferred:
   * `Columns.define<Product>()({ sku: { header: 'SKU', value: p => p.sku } })`.
   */
  define:
    <Row>() =>
    <Specs extends Record<string, ColumnSpec<Row, unknown>>>(
      specs: Specs & CheckboxValues<Row, Specs>,
    ): NoInfer<Columns<Row, Specs>> => {
      // A literal `__proto__:` key sets the prototype instead of naming a
      // column, so the column would vanish from `Object.keys`.
      if (Object.getPrototypeOf(specs) !== Object.prototype || Object.hasOwn(specs, '__proto__')) {
        throw new Error('Columns.define: "__proto__" cannot name a column.')
      }
      const given: Record<string, ColumnSpec<Row, unknown>> = specs
      const ids = Object.keys(given)
      const byId: Record<string, Column<Row, string, unknown>> = {}
      for (const id of ids) {
        if (arrayIndex.test(id)) {
          throw new Error(
            `Columns.define: the column id "${id}" is an array index, which JavaScript orders before every other key. Give it a name that is not a number.`,
          )
        }
        byId[id] = Object.freeze({ ...given[id]!, id })
      }
      return Object.freeze({
        ids: Object.freeze(ids),
        byId: Object.freeze(byId),
      }) as Columns<Row, Specs>
    },
}

import { Option, Predicate, Schema, SchemaAST } from 'effect'
import * as Node from '../node.js'
import { isFiniteNumber, isText, present } from '../ops/kind.js'
import { isInteger } from '../ops/textChecks.js'
import { optionInner } from '../path.js'
import * as Interval from './interval.js'

/** The integers a double holds exactly, which arithmetic must stay within or be refused. */
export const SAFE = Interval.between(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)

export type FieldKind = 'number' | 'boolean' | 'text' | 'literal' | 'struct' | 'other'

/** What a Schema says of the value at a path. */
export interface FieldInfo {
  readonly segments: ReadonlyArray<string>
  /** The field's whole Schema, null and checks included. */
  readonly ast: SchemaAST.AST
  readonly kind: FieldKind
  readonly isInt: boolean
  /** A number that is never NaN or infinite. */
  readonly finite: boolean
  /** Text that never holds a NUL (`Text.schema`), which no text or equality operation refuses. */
  readonly nulFree: boolean
  /** May read as null: `NullOr`, an optional key, or a field under either. */
  readonly nullable: boolean
  readonly interval: Interval.Interval
  readonly literals: Option.Option<ReadonlyArray<string | number | boolean>>
}

export const pathKey = (segments: ReadonlyArray<string>): string =>
  Node.key(Node.Path({ segments, ast: Option.none() }))

const boundOf = (
  checks: ReadonlyArray<SchemaAST.Check<unknown>>,
  isInt: boolean,
  start: Interval.Interval,
): Interval.Interval => {
  let iv = start
  for (const check of checks) {
    const representation = check.annotations?.representation
    const payload: Readonly<Record<string, unknown>> = Predicate.isObject(representation?.payload)
      ? representation.payload
      : {}
    const number = (name: string): Option.Option<number> => {
      const value = payload[name]
      return typeof value === 'number' ? Option.some(value) : Option.none()
    }
    const above = (m: number): Interval.Interval =>
      Interval.between(isInt ? Math.floor(m) + 1 : m, Infinity)
    const below = (m: number): Interval.Interval =>
      Interval.between(-Infinity, isInt ? Math.ceil(m) - 1 : m)
    const bounds: Readonly<Record<string, () => Option.Option<Interval.Interval>>> = {
      'effect/schema/isGreaterThanOrEqualTo': () =>
        Option.map(number('minimum'), m => Interval.between(m, Infinity)),
      'effect/schema/isGreaterThan': () => Option.map(number('exclusiveMinimum'), above),
      'effect/schema/isLessThanOrEqualTo': () =>
        Option.map(number('maximum'), m => Interval.between(-Infinity, m)),
      'effect/schema/isLessThan': () => Option.map(number('exclusiveMaximum'), below),
      'effect/schema/isBetween': () =>
        Option.some(
          Interval.meet(
            Option.match(number('minimum'), {
              onNone: () => Interval.top,
              onSome: m =>
                payload['exclusiveMinimum'] === true ? above(m) : Interval.between(m, Infinity),
            }),
            Option.match(number('maximum'), {
              onNone: () => Interval.top,
              onSome: m =>
                payload['exclusiveMaximum'] === true ? below(m) : Interval.between(-Infinity, m),
            }),
          ),
        ),
    }
    const id = representation?.id
    if (id !== undefined && Object.hasOwn(bounds, id)) {
      iv = Option.match(bounds[id]!(), { onNone: () => iv, onSome: b => Interval.meet(iv, b) })
    }
    if (check._tag === 'FilterGroup') iv = boundOf(check.checks, isInt, iv)
  }
  return iv
}

export const isPrimitive = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

export const flat = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> =>
  SchemaAST.isUnion(ast) ? ast.types.flatMap(flat) : [ast]

/**
 * Record what `ast` says of every path under `prefix`. `under` is whether an
 * enclosing field may be null or absent, which every field below it then may
 * read as.
 */
export const collectFields = (
  ast: SchemaAST.AST,
  prefix: ReadonlyArray<string>,
  fields: Map<string, FieldInfo>,
  under = false,
): void => {
  // A path reads an `Option` as its value or null, and a write of null stores a none.
  const inner = optionInner(ast)
  if (Option.isSome(inner)) {
    collectFields(Schema.NullOr(Schema.make(inner.value)).ast, prefix, fields, under)
    return
  }
  const members = present(ast)
  const nullable = under || members.length !== flat(ast).length || SchemaAST.isOptional(ast)
  const base: FieldInfo = {
    segments: prefix,
    ast,
    kind: 'other',
    isInt: false,
    finite: false,
    nulFree: false,
    nullable,
    interval: Interval.top,
    literals: Option.none(),
  }
  const set = (info: Partial<FieldInfo>): void => {
    fields.set(pathKey(prefix), { ...base, ...info })
  }
  const only = members.length === 1 ? members[0]! : undefined
  if (only !== undefined && SchemaAST.isObjects(only)) {
    set({ kind: 'struct' })
    for (const property of only.propertySignatures) {
      if (typeof property.name === 'string') {
        collectFields(property.type, [...prefix, property.name], fields, nullable)
      }
    }
    return
  }
  if (only !== undefined && SchemaAST.isNumber(only)) {
    const isInt = isInteger(only)
    set({
      kind: 'number',
      isInt,
      finite: isFiniteNumber(only),
      // `Schema.Int` admits safe integers only.
      interval: boundOf(only.checks ?? [], isInt, isInt ? SAFE : Interval.top),
    })
    return
  }
  if (only !== undefined && SchemaAST.isBoolean(only)) {
    set({ kind: 'boolean', literals: Option.some([true, false]) })
    return
  }
  if (only !== undefined && SchemaAST.isString(only)) {
    set({ kind: 'text', nulFree: isText(only) })
    return
  }
  const literals = members.flatMap(member =>
    SchemaAST.isLiteral(member) && isPrimitive(member.literal) ? [member.literal] : [],
  )
  if (literals.length > 0 && literals.length === members.length) {
    set({ kind: 'literal', literals: Option.some(literals) })
    return
  }
  set({})
}

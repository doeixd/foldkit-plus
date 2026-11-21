import { Option, Predicate, Schema, SchemaAST } from 'effect'
import type { Slice } from '../abstract/unordered.js'
import { textChecksOf, type TextChecks } from '../ops/textChecks.js'
import * as Path from '../path.js'

/** What a Schema says of each path. */
export type Sort = 'int' | 'real' | 'bool' | 'text' | 'struct' | 'other'

export interface PathInfo {
  readonly segments: ReadonlyArray<string>
  readonly sort: Sort
  readonly ast: SchemaAST.AST
  /** The flags any of which makes a read of this path null: its ancestors' and its own. */
  readonly flags: ReadonlyArray<string>
  readonly literals: ReadonlyArray<string | number | boolean>
  /** Inclusive bounds and exclusive ones, each the tightest declared. */
  readonly min: Option.Option<number>
  readonly max: Option.Option<number>
  readonly exclusiveMin: Option.Option<number>
  readonly exclusiveMax: Option.Option<number>
  /** A number whose Schema accepts NaN, which has no order. */
  readonly nan: boolean
  /** What the checks on text ask of it (none for any other sort); `nulFree` of `Text.schema`. */
  readonly text: TextChecks
}

/** A path that may read as null, and what a witness writes there: null, undefined, or no key. */
export interface Absence {
  readonly segments: ReadonlyArray<string>
  readonly as: 'null' | 'undefined' | 'omitted'
}

export interface Shape {
  readonly paths: Map<string, PathInfo>
  readonly absences: Map<string, Absence>
}

interface Bounds {
  min: Option.Option<number>
  max: Option.Option<number>
  exclusiveMin: Option.Option<number>
  exclusiveMax: Option.Option<number>
  int: boolean
}

const tighter = (
  prior: Option.Option<number>,
  value: unknown,
  pick: (a: number, b: number) => number,
): Option.Option<number> =>
  typeof value === 'number' && Number.isFinite(value)
    ? Option.some(Option.match(prior, { onNone: () => value, onSome: p => pick(p, value) }))
    : prior

const readChecks = (checks: ReadonlyArray<SchemaAST.Check<unknown>>, bounds: Bounds): void => {
  for (const check of checks) {
    const representation = check.annotations?.representation
    const payload: Readonly<Record<string, unknown>> = Predicate.isObject(representation?.payload)
      ? representation.payload
      : {}
    switch (representation?.id) {
      case 'effect/schema/isInt':
        bounds.int = true
        break
      case 'effect/schema/isGreaterThanOrEqualTo':
        bounds.min = tighter(bounds.min, payload['minimum'], Math.max)
        break
      case 'effect/schema/isGreaterThan':
        bounds.exclusiveMin = tighter(bounds.exclusiveMin, payload['exclusiveMinimum'], Math.max)
        break
      case 'effect/schema/isLessThanOrEqualTo':
        bounds.max = tighter(bounds.max, payload['maximum'], Math.min)
        break
      case 'effect/schema/isLessThan':
        bounds.exclusiveMax = tighter(bounds.exclusiveMax, payload['exclusiveMaximum'], Math.min)
        break
      case 'effect/schema/isBetween':
        if (payload['exclusiveMinimum'] === true) {
          bounds.exclusiveMin = tighter(bounds.exclusiveMin, payload['minimum'], Math.max)
        } else {
          bounds.min = tighter(bounds.min, payload['minimum'], Math.max)
        }
        if (payload['exclusiveMaximum'] === true) {
          bounds.exclusiveMax = tighter(bounds.exclusiveMax, payload['maximum'], Math.min)
        } else {
          bounds.max = tighter(bounds.max, payload['maximum'], Math.min)
        }
        break
    }
    if (check._tag === 'FilterGroup') readChecks(check.checks, bounds)
  }
}

const scalarLiteral = (ast: SchemaAST.AST): Option.Option<string | number | boolean> =>
  SchemaAST.isLiteral(ast) &&
  (typeof ast.literal === 'string' ||
    typeof ast.literal === 'number' ||
    typeof ast.literal === 'boolean')
    ? Option.some(ast.literal)
    : Option.none()

const noBounds = {
  min: Option.none<number>(),
  max: Option.none<number>(),
  exclusiveMin: Option.none<number>(),
  exclusiveMax: Option.none<number>(),
}

/** Read `ast` at `segments` into `shape`: every struct and field under it, with what may be null. */
const readShape = (
  ast: SchemaAST.AST,
  segments: ReadonlyArray<string>,
  above: ReadonlyArray<string>,
  optional: boolean,
  shape: Shape,
): void => {
  const name = Path.format(segments)
  const members = SchemaAST.isUnion(ast) ? ast.types : [ast]
  const present = members.filter(m => !SchemaAST.isNull(m) && !SchemaAST.isUndefined(m))
  const admitsNull = members.some(SchemaAST.isNull)
  const admitsUndefined = members.some(SchemaAST.isUndefined)
  const mayBeAbsent = admitsNull || optional || admitsUndefined
  const flag = `absent:${name}`
  const flags = mayBeAbsent ? [...above, flag] : above
  if (mayBeAbsent) {
    shape.absences.set(flag, {
      segments,
      as: admitsNull ? 'null' : admitsUndefined ? 'undefined' : 'omitted',
    })
  }
  const inner = present.length === 1 ? present[0]! : ast
  const info = (sort: Sort, more?: Partial<PathInfo>): void => {
    shape.paths.set(name, {
      segments,
      sort,
      ast: inner,
      flags,
      literals: [],
      ...noBounds,
      nan: false,
      text: { minLength: 0, maxLength: Infinity, nulFree: false, modelled: true },
      ...more,
    })
  }
  if (present.length === 1 && SchemaAST.isObjects(inner) && inner.indexSignatures.length === 0) {
    info('struct')
    for (const property of inner.propertySignatures) {
      if (typeof property.name === 'string') {
        readShape(
          property.type,
          [...segments, property.name],
          flags,
          SchemaAST.isOptional(property.type),
          shape,
        )
      }
    }
    return
  }
  // `NullOr(Literals([...]))` holds its literals in a union of their own.
  const choices = present.length === 1 && SchemaAST.isUnion(inner) ? inner.types : present
  const literals = choices.flatMap(choice => Option.toArray(scalarLiteral(choice)))
  if (choices.length > 0 && literals.length === choices.length) {
    const kinds = new Set(literals.map(literal => typeof literal))
    // Text codes and numbers share the solver's integers, so a mixed set has no sort.
    if (kinds.size > 1) return info('other', { literals })
    const sort: Sort =
      typeof literals[0] === 'string'
        ? 'text'
        : typeof literals[0] === 'boolean'
          ? 'bool'
          : literals.every(literal => Number.isInteger(literal))
            ? 'int'
            : 'real'
    return info(sort, { literals })
  }
  if (present.length > 1 && present.every(SchemaAST.isNumber)) {
    // A union of numbers is a number that may hold a fraction; its members' bounds are not one bound.
    return info('real', { nan: Schema.is(Schema.make<Schema.Top>(ast))(Number.NaN) })
  }
  if (present.length !== 1) return info('other')
  if (SchemaAST.isNumber(inner)) {
    const bounds: Bounds = { ...noBounds, int: false }
    readChecks(inner.checks ?? [], bounds)
    const { int, ...declared } = bounds
    return info(int ? 'int' : 'real', {
      ...declared,
      nan: Schema.is(Schema.make<Schema.Top>(inner))(Number.NaN),
    })
  }
  if (SchemaAST.isBoolean(inner)) return info('bool')
  if (SchemaAST.isString(inner)) {
    return info('text', { text: textChecksOf(inner) })
  }
  return info('other')
}

export const shapeOf = (slices: ReadonlyArray<Slice>): Shape => {
  const shape: Shape = { paths: new Map(), absences: new Map() }
  for (const [under, schema] of slices) readShape(schema.ast, under, [], false, shape)
  return shape
}

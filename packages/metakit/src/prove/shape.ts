import { Option, Predicate, Schema, SchemaAST } from 'effect'
import type { Slice } from '../abstract/unordered.js'
import * as Node from '../node.js'
import { isInteger, textChecksOf, type TextChecks } from '../ops/textChecks.js'
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
  /** A number whose Schema rejects NaN, +Infinity, and -Infinity (`Schema.Finite` / bounded). */
  readonly finite: boolean
  /** What the checks on text ask of it (none for any other sort); `nulFree` of `Text.schema`. */
  readonly text: TextChecks
  /** True when the Schema stores this field as an Effect `Option`. */
  readonly isOption?: boolean
  /** Element kind when this path is a scalar array (`Schema.Array(Int | Text | Literals)`). */
  readonly setElement?: 'int' | 'text'
  /** True when every element admitted by the array's element Schema is guaranteed finite & NUL-free. */
  readonly setValid?: boolean
  /** Exact literal elements when the array's element Schema is a finite literal union. */
  readonly setLiterals?: ReadonlyArray<string | number>
}

/** A path that may read as null, and what a witness writes there: null, undefined, omitted, or Option.none(). */
export interface Absence {
  readonly segments: ReadonlyArray<string>
  readonly as: 'null' | 'undefined' | 'omitted' | 'none'
  readonly always: boolean
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
  let current = ast
  let admitsNull = false
  let admitsUndefined = false
  let isOption = false
  let present: ReadonlyArray<SchemaAST.AST> = [current]
  while (true) {
    const opt = Path.optionInner(current)
    if (Option.isSome(opt)) {
      isOption = true
      current = opt.value
      present = [current]
      continue
    }
    if (SchemaAST.isNull(current)) {
      admitsNull = true
      present = []
      break
    }
    if (SchemaAST.isUndefined(current)) {
      admitsUndefined = true
      present = []
      break
    }
    if (SchemaAST.isUnion(current)) {
      if (current.types.some(SchemaAST.isNull)) admitsNull = true
      if (current.types.some(SchemaAST.isUndefined)) admitsUndefined = true
      const nonNull = current.types.filter(m => !SchemaAST.isNull(m) && !SchemaAST.isUndefined(m))
      if (nonNull.length === 1) {
        current = nonNull[0]!
        present = [current]
        continue
      }
      present = nonNull
      break
    }
    present = [current]
    break
  }
  const mayBeAbsent = admitsNull || optional || admitsUndefined || isOption
  const flag = `absent:${name}`
  const flags = mayBeAbsent ? [...above, flag] : above
  if (mayBeAbsent) {
    shape.absences.set(flag, {
      segments,
      as: isOption ? 'none' : admitsNull ? 'null' : admitsUndefined ? 'undefined' : 'omitted',
      always: present.length === 0,
    })
  }
  const inner = present.length === 1 ? present[0]! : current
  const info = (sort: Sort, more?: Partial<PathInfo>): void => {
    shape.paths.set(name, {
      segments,
      sort,
      ast: inner,
      flags,
      literals: [],
      ...noBounds,
      nan: false,
      finite: false,
      text: { minLength: 0, maxLength: Infinity, nulFree: false, modelled: true },
      ...(isOption ? { isOption: true } : {}),
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
    return info(sort, { literals, finite: sort === 'int' || sort === 'real' })
  }
  if (present.length > 1 && present.every(SchemaAST.isNumber)) {
    // A union of numbers is a number that may hold a fraction; its members' bounds are not one bound.
    const is = Schema.is(Schema.make<Schema.Top>(ast))
    const nan = is(Number.NaN)
    return info('real', { nan, finite: !nan && !is(Infinity) && !is(-Infinity) })
  }
  if (present.length !== 1) return info('other')
  if (SchemaAST.isNumber(inner)) {
    const bounds: Bounds = { ...noBounds, int: false }
    readChecks(inner.checks ?? [], bounds)
    const { int, ...declared } = bounds
    const is = Schema.is(Schema.make<Schema.Top>(inner))
    const nan = is(Number.NaN)
    return info(int ? 'int' : 'real', {
      ...declared,
      nan,
      finite: int || (!nan && !is(Infinity) && !is(-Infinity)),
    })
  }
  if (SchemaAST.isBoolean(inner)) return info('bool')
  if (SchemaAST.isString(inner)) {
    return info('text', { text: textChecksOf(inner) })
  }
  if (SchemaAST.isArrays(inner) && inner.elements.length === 0 && inner.rest.length === 1) {
    const elem = inner.rest[0]!
    if (isInteger(elem)) {
      return info('other', { setElement: 'int', setValid: true })
    }
    if (SchemaAST.isString(elem)) {
      return info('other', { setElement: 'text', setValid: textChecksOf(elem).nulFree })
    }
    const elemChoices = SchemaAST.isUnion(elem) ? elem.types : [elem]
    const elemLits = elemChoices.flatMap(choice => Option.toArray(scalarLiteral(choice)))
    if (elemChoices.length > 0 && elemLits.length === elemChoices.length) {
      if (elemLits.every(lit => typeof lit === 'string')) {
        return info('other', {
          setElement: 'text',
          setValid: !Node.holdsNul(elemLits),
          setLiterals: elemLits,
        })
      }
      if (
        elemLits.every((lit): lit is number => typeof lit === 'number' && Number.isSafeInteger(lit))
      ) {
        return info('other', { setElement: 'int', setValid: true, setLiterals: elemLits })
      }
    }
  }
  return info('other')
}

export const shapeOf = (slices: ReadonlyArray<Slice>): Shape => {
  const shape: Shape = { paths: new Map(), absences: new Map() }
  for (const [under, schema] of slices) readShape(schema.ast, under, [], false, shape)
  return shape
}

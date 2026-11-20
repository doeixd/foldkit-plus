/**
 * Non-interpreter Schema & Transition inspector (`metakit/inspect`) for forms,
 * data grids, CMS fields, and AI agent JSON Schemas.
 *
 * Reads Effect `SchemaAST`, `Expr.refinementsOf`, `Domain.domainOf`, and
 * `Transition.can` directly — no interpreter interface in between.
 */
import { Option, Schema, SchemaAST } from 'effect'
import { domainOfAst, type DomainMetadata } from './domain/annotation.js'
import * as Expr from './expr.js'
import * as Node from './node.js'
import * as Transition from './transition.js'
import * as Verdict from './verdict.js'

export interface FieldSpec {
  readonly name: string
  readonly kind:
    | 'integer'
    | 'number'
    | 'string'
    | 'boolean'
    | 'enum'
    | 'array'
    | 'object'
    | 'unknown'
  /** The key may be left out (`Schema.optional`, `Schema.optionalKey`). */
  readonly optional: boolean
  readonly nullable: boolean
  /**
   * The tightest lower and upper bounds: at most one of `min` and
   * `exclusiveMin` is set, and at most one of `max` and `exclusiveMax`.
   */
  readonly min: Option.Option<number>
  readonly max: Option.Option<number>
  readonly exclusiveMin: Option.Option<number>
  readonly exclusiveMax: Option.Option<number>
  readonly literals: Option.Option<ReadonlyArray<string | number | boolean>>
  readonly domain: Option.Option<DomainMetadata>
}

type Bounds = Pick<FieldSpec, 'min' | 'max' | 'exclusiveMin' | 'exclusiveMax'>
type BoundOp = 'ord.gte' | 'ord.gt' | 'ord.lte' | 'ord.lt'

const unbounded: Bounds = {
  min: Option.none(),
  max: Option.none(),
  exclusiveMin: Option.none(),
  exclusiveMax: Option.none(),
}

const tighter = (
  prev: Option.Option<number>,
  value: number,
  pick: (a: number, b: number) => number,
): Option.Option<number> =>
  Option.some(Option.match(prev, { onNone: () => value, onSome: p => pick(p, value) }))

const addBound = (bounds: Bounds, op: BoundOp, value: number): Bounds => {
  switch (op) {
    case 'ord.gte':
      return { ...bounds, min: tighter(bounds.min, value, Math.max) }
    case 'ord.gt':
      return { ...bounds, exclusiveMin: tighter(bounds.exclusiveMin, value, Math.max) }
    case 'ord.lte':
      return { ...bounds, max: tighter(bounds.max, value, Math.min) }
    case 'ord.lt':
      return { ...bounds, exclusiveMax: tighter(bounds.exclusiveMax, value, Math.min) }
  }
}

/** One bound per side: an exclusive bound at or past the inclusive one implies it, and the reverse. */
const tightest = ({ min, exclusiveMin, max, exclusiveMax }: Bounds): Bounds => {
  const lowExclusive = Option.isSome(min) && Option.isSome(exclusiveMin)
  const keepExclusiveMin = lowExclusive && exclusiveMin.value >= min.value
  const highExclusive = Option.isSome(max) && Option.isSome(exclusiveMax)
  const keepExclusiveMax = highExclusive && exclusiveMax.value <= max.value
  return {
    min: keepExclusiveMin ? Option.none() : min,
    exclusiveMin: lowExclusive && !keepExclusiveMin ? Option.none() : exclusiveMin,
    max: keepExclusiveMax ? Option.none() : max,
    exclusiveMax: highExclusive && !keepExclusiveMax ? Option.none() : exclusiveMax,
  }
}

const flipped: Readonly<Record<BoundOp, BoundOp>> = {
  'ord.gte': 'ord.lte',
  'ord.gt': 'ord.lt',
  'ord.lte': 'ord.gte',
  'ord.lt': 'ord.gt',
}

const isBoundOp = (id: string): id is BoundOp => id in flipped

/** Add the bounds that conjuncts of `rules` (`$.x >= 0` or `0 <= $.x`) put on the path `at`. */
const boundsAt = (
  bounds: Bounds,
  rules: ReadonlyArray<Node.Node>,
  at: ReadonlyArray<string>,
): Bounds => {
  const isAt = (node: Node.Node) =>
    Node.$is('Path')(node) &&
    node.segments.length === at.length &&
    node.segments.every((segment, i) => segment === at[i])
  const numberOf = (node: Node.Node): Option.Option<number> =>
    Node.$is('Lit')(node) && typeof node.value === 'number'
      ? Option.some(node.value)
      : Option.none()
  const visit = (acc: Bounds, node: Node.Node): Bounds => {
    if (!Node.$is('Call')(node)) return acc
    const [a, b] = node.args
    if (a === undefined || b === undefined) return acc
    if (node.op.id === 'bool.and') return visit(visit(acc, a), b)
    const op = node.op.id
    if (!isBoundOp(op)) return acc
    if (isAt(a)) {
      return Option.match(numberOf(b), { onNone: () => acc, onSome: v => addBound(acc, op, v) })
    }
    if (isAt(b)) {
      return Option.match(numberOf(a), {
        onNone: () => acc,
        onSome: v => addBound(acc, flipped[op], v),
      })
    }
    return acc
  }
  return rules.reduce(visit, bounds)
}

const ruleNodes = (schema: Schema.Top): ReadonlyArray<Node.Node> =>
  Expr.refinementsOf(schema).map(r => r.node)

const isIntCheck = (check: SchemaAST.Check<unknown>): boolean =>
  check.annotations?.representation?.id === 'effect/schema/isInt' ||
  (check._tag === 'FilterGroup' && check.checks.some(isIntCheck))

const scalarLiteral = (ast: SchemaAST.AST): Option.Option<string | number | boolean> =>
  SchemaAST.isLiteral(ast) &&
  (typeof ast.literal === 'string' ||
    typeof ast.literal === 'number' ||
    typeof ast.literal === 'boolean')
    ? Option.some(ast.literal)
    : Option.none()

const kindOf = (ast: SchemaAST.AST): FieldSpec['kind'] => {
  if (SchemaAST.isNumber(ast)) return (ast.checks ?? []).some(isIntCheck) ? 'integer' : 'number'
  if (SchemaAST.isString(ast)) return 'string'
  if (SchemaAST.isBoolean(ast)) return 'boolean'
  if (SchemaAST.isArrays(ast)) return 'array'
  if (SchemaAST.isObjects(ast)) return 'object'
  return 'unknown'
}

/** A field's spec, the AST left once `null` and `undefined` are taken out, and its path. */
interface Field {
  readonly spec: FieldSpec
  readonly inner: SchemaAST.AST
  readonly at: ReadonlyArray<string>
}

const readField = (
  name: string,
  ast: SchemaAST.AST,
  optional: boolean,
  rules: ReadonlyArray<Node.Node>,
  at: ReadonlyArray<string>,
): Field => {
  const members = SchemaAST.isUnion(ast)
    ? ast.types.filter(t => !SchemaAST.isNull(t) && !SchemaAST.isUndefined(t))
    : [ast]
  const inner = members.length === 1 ? members[0]! : ast
  const literals = members.flatMap(member => Option.toArray(scalarLiteral(member)))
  const isEnum = members.length > 0 && literals.length === members.length
  // A check on a `NullOr` or `optional` member sits outside the parent's rules, so read it here.
  const ownRules = ruleNodes(Schema.make<Schema.Top>(inner))
  const bounds = tightest(boundsAt(boundsAt(unbounded, ownRules, []), rules, at))
  return {
    spec: {
      name,
      kind: isEnum ? 'enum' : members.length === 1 ? kindOf(inner) : 'unknown',
      optional,
      nullable: SchemaAST.isUnion(ast) && ast.types.some(SchemaAST.isNull),
      ...bounds,
      literals: isEnum ? Option.some(literals) : Option.none(),
      domain: Option.orElse(domainOfAst(ast), () => domainOfAst(inner)),
    },
    inner,
    at,
  }
}

const fieldsOf = (
  ast: SchemaAST.AST,
  rules: ReadonlyArray<Node.Node>,
  at: ReadonlyArray<string>,
): ReadonlyArray<Field> =>
  SchemaAST.isObjects(ast)
    ? ast.propertySignatures.flatMap(prop =>
        typeof prop.name === 'string'
          ? [
              readField(prop.name, prop.type, SchemaAST.isOptional(prop.type), rules, [
                ...at,
                prop.name,
              ]),
            ]
          : [],
      )
    : [readField('$', ast, false, rules, at)]

/**
 * Extract per-field kind, optionality, nullability, tightest bounds, enum
 * literals, and domain metadata from a struct Schema (a non-struct Schema reads
 * as one field named `$`).
 */
export const fieldSpecs = <S extends Schema.Top>(schema: S): ReadonlyArray<FieldSpec> =>
  fieldsOf(schema.ast, ruleNodes(schema), []).map(field => field.spec)

const objectJson = (
  fields: ReadonlyArray<Field>,
  rules: ReadonlyArray<Node.Node>,
): Record<string, unknown> => ({
  type: 'object',
  properties: Object.fromEntries(fields.map(field => [field.spec.name, fieldJson(field, rules)])),
  required: fields.filter(field => !field.spec.optional).map(field => field.spec.name),
  additionalProperties: false,
})

const enumType = (literals: ReadonlyArray<string | number | boolean>): string =>
  literals.every(v => typeof v === 'number')
    ? 'number'
    : literals.every(v => typeof v === 'boolean')
      ? 'boolean'
      : 'string'

/** The field's shape; an unknown kind claims no `type`. */
const shapeJson = (field: Field, rules: ReadonlyArray<Node.Node>): Record<string, unknown> => {
  const { spec, inner } = field
  const typed = (type: string) => ({ type: spec.nullable ? [type, 'null'] : type })
  switch (spec.kind) {
    case 'unknown':
      return {}
    case 'enum': {
      const literals = Option.getOrElse(spec.literals, () => [])
      return { ...typed(enumType(literals)), enum: literals }
    }
    case 'array': {
      // Only a homogeneous array (`Schema.Array`) has one item shape to state.
      const item =
        SchemaAST.isArrays(inner) && inner.elements.length === 0 && inner.rest.length === 1
          ? Option.some(inner.rest[0]!)
          : Option.none()
      return Option.match(item, {
        onNone: () => typed('array'),
        onSome: ast => ({
          ...typed('array'),
          items: fieldJson(readField('', ast, false, [], []), []),
        }),
      })
    }
    case 'object':
      // A record's keys are open, so only a struct without index signatures lists its properties.
      return SchemaAST.isObjects(inner) && inner.indexSignatures.length === 0
        ? { ...objectJson(fieldsOf(inner, rules, field.at), rules), ...typed('object') }
        : typed('object')
    case 'integer':
    case 'number':
    case 'string':
    case 'boolean':
      return typed(spec.kind)
  }
}

const fieldJson = (field: Field, rules: ReadonlyArray<Node.Node>): Record<string, unknown> => {
  const { spec } = field
  const json = shapeJson(field, rules)
  if (Option.isSome(spec.min)) json['minimum'] = spec.min.value
  if (Option.isSome(spec.max)) json['maximum'] = spec.max.value
  if (Option.isSome(spec.exclusiveMin)) json['exclusiveMinimum'] = spec.exclusiveMin.value
  if (Option.isSome(spec.exclusiveMax)) json['exclusiveMaximum'] = spec.exclusiveMax.value
  if (Option.isSome(spec.domain)) json['x-metakit-domain'] = spec.domain.value
  return json
}

/**
 * Generate a JSON Schema object enriched with `Expr.refine` bounds and
 * `metakit/domain` metadata (`x-metakit-domain`). Arrays state their item shape
 * and nested structs their properties; `required` lists only keys that may not
 * be left out.
 */
export const toJsonSchema = <S extends Schema.Top>(
  schema: S,
): Readonly<Record<string, unknown>> => {
  const rules = ruleNodes(schema)
  return objectJson(fieldsOf(schema.ast, rules, []), rules)
}

type TransitionState<T> = T extends {
  readonly when: Expr.Expr<Transition.TransitionEnv<infer S, never>, boolean>
}
  ? S
  : never

/** Evaluate `Transition.can` across a transition map for UI buttons and agent tool visibility. */
export const affordances = <
  Transitions extends Readonly<
    Record<string, { readonly when: Expr.Expr<Transition.TransitionEnv<never, never>, boolean> }>
  >,
>(
  transitions: Transitions,
  partialState: Expr.PartialEnv<TransitionState<Transitions[keyof Transitions]>>,
): {
  readonly available: ReadonlyArray<keyof Transitions & string>
  readonly disabled: ReadonlyArray<keyof Transitions & string>
  readonly unknown: ReadonlyArray<keyof Transitions & string>
} => {
  const available: Array<keyof Transitions & string> = []
  const disabled: Array<keyof Transitions & string> = []
  const unknown: Array<keyof Transitions & string> = []
  for (const [name, tr] of Object.entries(transitions) as Array<
    readonly [
      keyof Transitions & string,
      { readonly when: Expr.Expr<Transition.TransitionEnv<never, never>, boolean> },
    ]
  >) {
    Verdict.match(
      Transition.can(
        tr as Transition.Transition<unknown, unknown, unknown>,
        {
          state: partialState,
        } as never,
      ),
      {
        True: () => available.push(name),
        False: () => disabled.push(name),
        Unknown: () => unknown.push(name),
      },
    )
  }
  return { available, disabled, unknown }
}

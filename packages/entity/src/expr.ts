/**
 * `Expr` — a query's scalar computations as typed values.
 *
 * An Entity says what a domain has; an `Expr` says something about one row of
 * it. A field reference, an input placeholder, a literal, and comparisons of
 * those are all immutable data: building one performs no work, reads nothing,
 * and names no database. An interpreter compiles it — `foldkit-remote-drizzle`
 * to SQL, an in-memory evaluator to a predicate over rows.
 *
 * This is deliberately not SQL and deliberately not arbitrary JavaScript. Every
 * operation here is one a real query in this repository needs; the set grows
 * from queries, not from what a database could express.
 */
import { Pipeable, Schema } from 'effect'
import type { AnyEntity, EntityField, EntityIdentity } from './index.js'

/** A constant the query was written with. */
export interface LiteralExpr<T> {
  readonly _tag: 'Literal'
  readonly value: T
}

/**
 * One field of one Entity. `owner` is the Entity's identity rather than its
 * name, so two Entities defined with the same name are not one column.
 */
export interface FieldExpr<T> {
  readonly _tag: 'Field'
  readonly owner: EntityIdentity<string>
  readonly key: string
  readonly schema: Schema.Codec<T, unknown>
}

/**
 * A value the query is given when it runs. A definition's body is built once,
 * so inside it an input is this placeholder and never the value: there is
 * nothing yet to branch on, and a query that wants to depend on what was passed
 * says so with an operation over the placeholder.
 */
export interface InputExpr<T> {
  readonly _tag: 'Input'
  readonly key: string
  readonly schema: Schema.Codec<T, unknown>
}

/** A typed scalar: what a comparison compares. */
export type Expr<T> = LiteralExpr<T> | FieldExpr<T> | InputExpr<T>

/** Any scalar, for the places that hold operands without caring what they are. */
export type AnyExpr = Expr<unknown>

/**
 * `Expr<boolean>`, in the shape the operations that exist can actually take.
 * The design's kernel is all boolean-valued (`eq`, `and`, `isNull`,
 * `contains`, …), so a predicate is its own type rather than a phantom
 * parameter on a general operation node: `Predicate` and `Expr<string>` cannot
 * then be confused, which a structural phantom would allow. A scalar-valued
 * operation, if one is ever needed, joins `Expr` instead.
 */
export type Predicate = EqPredicate | NullPredicate | ContainsPredicate

/** Two values are the same. */
export interface EqPredicate {
  readonly _tag: 'Eq'
  readonly left: Operandish
  readonly right: Operandish
}

/**
 * Whether a value is absent. `present` says which answer absence gives, so one
 * node covers `is null` and `is not null` rather than two that differ by a
 * negation nothing else can express.
 */
export interface NullPredicate {
  readonly _tag: 'Null'
  readonly operand: AnyExpr
  readonly present: boolean
}

/**
 * Whether a text value contains another. Containing the empty string is
 * everything, which is what lets a search box with nothing typed in it be the
 * same query as one with something — see `Expr.contains`.
 */
export interface ContainsPredicate {
  readonly _tag: 'Contains'
  readonly value: AnyExpr
  readonly search: Operandish
}

/**
 * Anything an operation can be given: a scalar, or a predicate where a boolean
 * is wanted. `Expr.eq(Expr.isNotNull(archivedAt), input.archived)` is the
 * second case, and it is how a query depends on an input without branching on
 * it.
 */
export type Operandish = AnyExpr | Predicate

/** A field, a scalar already built from one, or a predicate used as a boolean. */
type Operand<T> = EntityField<string, string, Schema.Constraint> | Expr<T> | Predicate

/** What an operand is worth, so a comparison's other side is checked against it. */
export type ValueOf<E> =
  E extends EntityField<string, string, infer S>
    ? Schema.Schema.Type<S>
    : E extends Predicate
      ? boolean
      : E extends Expr<infer T>
        ? T
        : never

const tagOf = (value: unknown): unknown =>
  typeof value === 'object' && value !== null
    ? (value as { readonly _tag?: unknown })._tag
    : undefined

/**
 * An Entity's field and a `FieldExpr` are the same three members under the same
 * tag — the Entity's carries `metadata` besides — so this reads either and is
 * idempotent on its own output. Nothing needs to tell them apart, which is
 * better than telling them apart by which extra member happens to be present.
 */
const literal = <T>(value: T): LiteralExpr<T> => ({ _tag: 'Literal', value })

const fieldExpr = (field: EntityField<string, string, Schema.Constraint>): FieldExpr<unknown> => ({
  _tag: 'Field',
  owner: field.owner,
  key: field.key,
  schema: field.schema as unknown as Schema.Codec<unknown, unknown>,
})

const predicateTags = new Set(['Eq', 'Null', 'Contains'])

/** Whether a value is a predicate, and so usable where a boolean is wanted. */
export const isPredicate = (value: unknown): value is Predicate =>
  predicateTags.has(tagOf(value) as string)

/**
 * A field of either kind becomes a `FieldExpr`, a scalar or a predicate is
 * itself, and anything else is the constant it is.
 */
const toOperand = <T>(value: Operand<T> | T): Operandish => {
  const tag = tagOf(value)
  if (tag === 'Field') {
    return fieldExpr(value as EntityField<string, string, Schema.Constraint>)
  }
  if (tag === 'Literal' || tag === 'Input' || predicateTags.has(tag as string)) {
    return value as Operandish
  }
  return literal(value)
}

/** As `toOperand`, where only a scalar makes sense: `is null` of a predicate is not a question. */
const toExpr = <T>(value: Operand<T> | T, step: string): AnyExpr => {
  const operand = toOperand(value)
  if (isPredicate(operand)) {
    throw new Error(
      `[foldkit-entity] Expr.${step}: a predicate is already an answer, so asking this of one is not a question`,
    )
  }
  return operand
}

/**
 * Every operation the kernel has. An interpreter declares which of them it
 * runs, and a body needing one it does not is refused rather than answered
 * wrongly — see `Query.unsupported`.
 */
export type Operation = 'eq' | 'isNull' | 'isNotNull' | 'contains'

/** Which fields and inputs an expression reads, and which operations it uses. */
export interface Dependencies {
  /** One entry per distinct field, as `Entity.key`. */
  readonly fields: ReadonlyArray<{ readonly entity: string; readonly key: string }>
  /** One entry per distinct input key. */
  readonly inputs: ReadonlyArray<string>
  /** One entry per distinct operation, so an interpreter can refuse what it cannot run. */
  readonly operations: ReadonlyArray<Operation>
}

export const Expr = {
  /** A constant. Comparisons coerce a plain value, so this is rarely written. */
  literal,

  /**
   * A value the query is given when it runs. A definition builds these from its
   * `Input` schema; written by hand only when constructing a body directly.
   */
  input: <T>(key: string, schema: Schema.Codec<T, unknown>): InputExpr<T> => ({
    _tag: 'Input',
    key,
    schema,
  }),

  /** One field of one Entity, as a scalar. */
  field: <Name extends string, Key extends string, S extends Schema.Constraint>(
    field: EntityField<Name, Key, S>,
  ): FieldExpr<Schema.Schema.Type<S>> => fieldExpr(field) as FieldExpr<Schema.Schema.Type<S>>,

  /**
   * Two scalars are the same value. A field or a plain value on either side is
   * coerced, so the common form reads as it means:
   *
   * ```ts
   * Expr.eq(Post.fields.slug, input.slug)
   * Expr.eq(Post.fields.status, 'active')
   * ```
   */
  eq: <L extends Operand<any>>(
    left: L,
    right: ValueOf<L> | Expr<ValueOf<L>> | (boolean extends ValueOf<L> ? Predicate : never),
  ): EqPredicate => ({
    _tag: 'Eq',
    left: toOperand(left),
    right: toOperand(right as never),
  }),

  /**
   * Whether a field holds no value. Its opposite is `isNotNull`; both are the
   * one node, because a query asks which of the two it means and nothing here
   * can negate a predicate.
   */
  isNull: <L extends Operand<any>>(operand: L): NullPredicate => ({
    _tag: 'Null',
    operand: toExpr(operand, 'isNull'),
    present: false,
  }),

  /** Whether a field holds a value. */
  isNotNull: <L extends Operand<any>>(operand: L): NullPredicate => ({
    _tag: 'Null',
    operand: toExpr(operand, 'isNotNull'),
    present: true,
  }),

  /**
   * Whether a text value contains `search`, anywhere in it. Containing the
   * empty string is everything, so a search box with nothing typed in it is the
   * same query as one with something — no branch, and no second query.
   *
   * **Case-insensitive**, which is what a search means, and which has to be
   * said rather than left to the interpreter: SQLite's `like` ignores case and
   * Postgres's does not, so a body that left it open would mean two things.
   * Folding is ASCII-only, because that is what `lower` does in SQLite without
   * ICU.
   *
   * **Over a column that can be null this is not the same as no filter.** A
   * null contains nothing, not even the empty string, so its rows drop out. A
   * nullable column that should match everything on an empty search says so:
   * `Expr.or` does not exist yet, so for now such a column needs its own
   * predicate or a native escape hatch.
   */
  contains: <L extends Operand<any>>(
    value: L,
    search: string | Expr<string>,
  ): ContainsPredicate => ({
    _tag: 'Contains',
    value: toExpr(value, 'contains'),
    search: toOperand(search as never),
  }),

  /** An expression as readable text; see `showExpr` for what it is and is not. */
  show: (node: Operandish): string => showExpr(node),
}

/** One term of an ordering: a scalar and the direction to read it in. */
export interface OrderTerm {
  readonly direction: 'asc' | 'desc'
  readonly expr: AnyExpr
}

export const Order = {
  asc: <E extends Operand<any>>(expr: E): OrderTerm => ({
    direction: 'asc',
    expr: toExpr(expr as never, 'asc'),
  }),
  desc: <E extends Operand<any>>(expr: E): OrderTerm => ({
    direction: 'desc',
    expr: toExpr(expr as never, 'desc'),
  }),
}

const walk = (
  node: AnyExpr | Predicate,
  fields: Map<string, { readonly entity: string; readonly key: string }>,
  inputs: Set<string>,
  operations: Set<Operation>,
): void => {
  switch (node._tag) {
    case 'Literal':
      return
    case 'Field':
      fields.set(`${node.owner.name}.${node.key}`, { entity: node.owner.name, key: node.key })
      return
    case 'Input':
      inputs.add(node.key)
      return
    case 'Eq':
      operations.add('eq')
      walk(node.left, fields, inputs, operations)
      walk(node.right, fields, inputs, operations)
      return
    case 'Null':
      operations.add(node.present ? 'isNotNull' : 'isNull')
      walk(node.operand, fields, inputs, operations)
      return
    case 'Contains':
      operations.add('contains')
      walk(node.value, fields, inputs, operations)
      walk(node.search, fields, inputs, operations)
      return
  }
}

/**
 * What an expression reads and uses, for the planner and for an interpreter
 * deciding whether it can run this query at all. Distinct entries only, in the
 * order first seen, so the answer is stable enough to assert on.
 */
export const dependenciesOf = (
  ...nodes: ReadonlyArray<AnyExpr | Predicate | OrderTerm>
): Dependencies => {
  const fields = new Map<string, { readonly entity: string; readonly key: string }>()
  const inputs = new Set<string>()
  const operations = new Set<Operation>()
  for (const node of nodes) {
    walk('direction' in node ? node.expr : node, fields, inputs, operations)
  }
  return { fields: [...fields.values()], inputs: [...inputs], operations: [...operations] }
}

/**
 * Which rows a query is about, as a value: an Entity to read, the predicates
 * every row must satisfy, and the order to read them in. It says nothing about
 * which fields to return — that is a Selection — and nothing about pagination,
 * liveness, or whether absence is an error, which belong to the consumer's read
 * rather than to the relation.
 *
 * Composing one performs no work. `Query.from(Post)` names no table and opens
 * no connection; an interpreter turns the value into a query when something
 * asks it to.
 */
export interface Query<E extends AnyEntity> extends Pipeable.Pipeable {
  readonly _tag: 'Query'
  readonly entity: E
  /**
   * Every predicate holds: the list *is* the conjunction. Keeping it a list
   * rather than folding it into one `and` is what makes each `where` a reusable
   * fragment, and it means no `Expr.and` exists until a query needs a
   * conjunction nested inside something else.
   */
  readonly where: ReadonlyArray<Predicate>
  /** In order of significance; a later `orderBy` appends less significant terms. */
  readonly orderBy: ReadonlyArray<OrderTerm>
}

/** A `Query` over any Entity, for the places that hold one without caring which. */
export type AnyQuery = Query<AnyEntity>

/** Every field an expression reads, as the nodes themselves. */
const fieldsIn = function* (node: AnyExpr | Predicate): Generator<FieldExpr<unknown>> {
  switch (node._tag) {
    case 'Field':
      yield node
      return
    case 'Literal':
    case 'Input':
      return
    case 'Eq':
      yield* fieldsIn(node.left)
      yield* fieldsIn(node.right)
      return
    case 'Null':
      yield* fieldsIn(node.operand)
      return
    case 'Contains':
      yield* fieldsIn(node.value)
      yield* fieldsIn(node.search)
      return
  }
}

/**
 * A query reads one Entity, so a predicate or ordering term naming a different
 * one cannot be answered — an interpreter would be asked for a column of a
 * table it was never told to read. Compared by identity, not by name, because
 * two Entities defined with the same name are two Entities.
 */
const checkOwnership = (
  step: string,
  what: string,
  entity: AnyEntity,
  nodes: ReadonlyArray<AnyExpr | Predicate | OrderTerm>,
): void => {
  for (const node of nodes) {
    for (const field of fieldsIn('direction' in node ? node.expr : node)) {
      if (field.owner.token !== entity.identity.token) {
        throw new Error(
          `[foldkit-entity] Query.${step}: ${what} reads ${field.owner.name}.${field.key}, but the query is from ${entity.name}`,
        )
      }
    }
  }
}

const QueryProto = {
  _tag: 'Query' as const,
  pipe() {
    return Pipeable.pipeArguments(this, arguments)
  },
}

const query = <E extends AnyEntity>(
  entity: E,
  where: ReadonlyArray<Predicate>,
  orderBy: ReadonlyArray<OrderTerm>,
): Query<E> =>
  Object.freeze(
    Object.assign(Object.create(QueryProto), {
      entity,
      where: Object.freeze(where),
      orderBy: Object.freeze(orderBy),
    }),
  ) as Query<E>

export const Query = {
  /** Every row of an Entity: the query each transformation narrows. */
  from: <E extends AnyEntity>(entity: E): Query<E> => query(entity, [], []),

  /**
   * Narrows to the rows the predicate holds for. Two `where`s conjoin — the
   * second never replaces the first — so a fragment can be written once and
   * piped into any query over the same Entity:
   *
   * ```ts
   * const published = Query.where(Expr.eq(Post.fields.published, true))
   * Query.from(Post).pipe(published, Query.where(byTitle))
   * ```
   */
  where:
    (...predicates: ReadonlyArray<Predicate>) =>
    <E extends AnyEntity>(self: Query<E>): Query<E> => {
      if (predicates.length === 0) return self
      checkOwnership('where', 'a predicate', self.entity, predicates)
      return query(self.entity, [...self.where, ...predicates], self.orderBy)
    },

  /**
   * Reads the rows in this order. Two `orderBy`s append, so an earlier term
   * stays the more significant one and a later call adds a tie-breaker rather
   * than silently winning.
   */
  orderBy:
    (...terms: ReadonlyArray<OrderTerm>) =>
    <E extends AnyEntity>(self: Query<E>): Query<E> => {
      if (terms.length === 0) return self
      checkOwnership('orderBy', 'a term', self.entity, terms)
      return query(self.entity, self.where, [...self.orderBy, ...terms])
    },

  /**
   * What the whole query reads: the fields and inputs of every predicate and
   * every ordering term, and the operations it uses.
   */
  dependencies: (self: AnyQuery): Dependencies => dependenciesOf(...self.where, ...self.orderBy),

  /**
   * The operations this query needs that `supported` does not list, in the
   * order the query uses them. Empty means an interpreter declaring
   * `supported` can answer it.
   *
   * An interpreter declares what it runs and refuses the rest, rather than
   * ignoring an operation it does not implement — which would answer a
   * different question and say nothing. The refusal is the interpreter's to
   * raise: this only says what is missing, because what to do about it differs
   * between one that compiles at registration and one that runs a body
   * directly.
   *
   * ```ts
   * const missing = Query.unsupported(body, ['eq', 'isNull', 'isNotNull'])
   * if (missing.length > 0) throw new Error(`cannot run ${missing.join(', ')}`)
   * ```
   */
  unsupported: (self: AnyQuery, supported: ReadonlyArray<Operation>): ReadonlyArray<Operation> => {
    const runs = new Set(supported)
    return Query.dependencies(self).operations.filter(operation => !runs.has(operation))
  },

  /**
   * The whole query as readable text, one clause per line:
   *
   * ```text
   * FROM Post
   * WHERE Post.slug = $slug
   *   AND Post.published = true
   * ORDER BY Post.updatedAt DESC
   * ```
   *
   * For an explanation or a diagnostic, never for an interpreter — see
   * `Expr.show`. A query with no `where` or no `orderBy` omits that line rather
   * than printing an empty one, so what is shown is what was written.
   */
  show: (self: AnyQuery): string =>
    [
      `FROM ${self.entity.name}`,
      ...self.where.map(
        (predicate, index) => `${index === 0 ? 'WHERE' : '  AND'} ${Expr.show(predicate)}`,
      ),
      ...(self.orderBy.length === 0
        ? []
        : [
            `ORDER BY ${self.orderBy
              .map(term => `${Expr.show(term.expr)} ${term.direction.toUpperCase()}`)
              .join(', ')}`,
          ]),
    ].join('\n'),
}

/**
 * An expression as readable text, in the IR's own terms.
 *
 * This is for a human — an explanation, a diagnostic, a test that wants to
 * assert on a whole predicate at once — and deliberately **not** for an
 * interpreter. It is close enough to SQL to read at a glance and unlike it
 * everywhere that matters: an input is `$slug` rather than a bound parameter,
 * `contains` is named rather than rendered as somebody's `like`, and no
 * dialect's escaping or collation is implied. What actually ran is whatever
 * that backend compiled, which is not this.
 *
 * A predicate standing where a value is wanted is parenthesised, because
 * `x is not null = $archived` reads as three operands and is two. A predicate
 * that *is* the whole expression is not: nothing encloses it.
 */
const showExpr = (node: AnyExpr | Predicate): string => {
  switch (node._tag) {
    case 'Literal':
      return JSON.stringify(node.value) ?? String(node.value)
    case 'Field':
      return `${node.owner.name}.${node.key}`
    case 'Input':
      return `$${node.key}`
    case 'Eq':
      return `${showOperand(node.left)} = ${showOperand(node.right)}`
    case 'Null':
      return `${showOperand(node.operand)} is ${node.present ? 'not null' : 'null'}`
    case 'Contains':
      return `contains(${showOperand(node.value)}, ${showOperand(node.search)})`
  }
}

const showOperand = (node: Operandish): string =>
  isPredicate(node) ? `(${showExpr(node)})` : showExpr(node)

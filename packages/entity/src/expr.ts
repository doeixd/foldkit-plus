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
import { Match, Option, Pipeable, Schema, SchemaAST } from 'effect'
import { Collation } from './collation.js'
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
  /**
   * How it compares when ordered by, as the field declares (`Collation.of`).
   * An id is `binary` unless it says otherwise: its order need only be total
   * and agreed, and every order ends on it.
   */
  readonly collation: Option.Option<Collation>
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

/**
 * A field or scalar whose value is text, or absent text.
 *
 * `Expr.contains` is a case-insensitive **text** search that compiles to
 * `lower(column) like lower(?)`. Over a number that is nonsense which reaches
 * the database — SQLite coerces and answers something, Postgres raises — so
 * the operand is constrained here rather than discovered there.
 *
 * Null belongs in the type, because a nullable text column is a real and
 * documented case: a null contains nothing, not even the empty string, so its
 * rows drop out of a search that would otherwise match everything.
 *
 * Written as a **constraint on the type parameter** rather than as a check
 * intersected onto the parameter (the `Invalid` idiom `foldkit-remote` uses for
 * an unregistered descriptor). That idiom compares an already-resolved indexed
 * access; here the check would be a conditional over the type being inferred,
 * and inference falls back to the constraint — whose `Expr<any>` branch makes
 * the check vacuously true, so every operand passes. A constraint cannot be
 * defeated that way.
 */
export type TextOperand =
  | EntityField<string, string, Schema.Constraint & Schema.Codec<string | null, any, any, any>>
  | Expr<string>
  | Expr<string | null>

const tagOf = (value: unknown): unknown =>
  typeof value === 'object' && value !== null && '_tag' in value ? value._tag : undefined

/**
 * An Entity's field and a `FieldExpr` are the same three members under the same
 * tag — the Entity's carries `metadata` besides — so this reads either and is
 * idempotent on its own output. Nothing needs to tell them apart, which is
 * better than telling them apart by which extra member happens to be present.
 */
/**
 * Every node is frozen as it is made, so a query built from it stays the value
 * it was when `Query.where` checked it: nothing can swap a field or a literal
 * in afterwards. It also means no node can come to contain itself. A literal's
 * own payload is the caller's; the kernel compares scalars.
 */
const node = <T extends object>(value: T): T => Object.freeze(value)

const literal = <T>(value: T): LiteralExpr<T> => node({ _tag: 'Literal', value })

const fieldExpr = (field: EntityField<string, string, Schema.Constraint>): FieldExpr<unknown> =>
  node({
    _tag: 'Field',
    owner: field.owner,
    key: field.key,
    schema: field.schema as unknown as Schema.Codec<unknown, unknown>,
    collation: Option.orElse(Collation.declared(field.metadata), () =>
      field.key === 'id' ? Option.some(Collation.binary) : Option.none(),
    ),
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

/** One field an expression reads: its Entity's name and key, and the identity that owns it. */
export interface FieldDependency {
  /** The owning Entity's name, for display; two Entities may share one. */
  readonly entity: string
  readonly key: string
  /** Which Entity it is. Two defined with the same name are two entries. */
  readonly owner: EntityIdentity<string>
}

/** Which fields and inputs an expression reads, and which operations it uses. */
export interface Dependencies {
  /** One entry per distinct field of each Entity identity. */
  readonly fields: ReadonlyArray<FieldDependency>
  /** One entry per distinct input key. */
  readonly inputs: ReadonlyArray<string>
  /** One entry per distinct operation, so an interpreter can refuse what it cannot run. */
  readonly operations: ReadonlyArray<Operation>
}

/**
 * What a query reads, with each field's role. A change to a `predicate` field
 * can move a row into or out of the result; a change to an `order` field can
 * move it within. A field in both is in both; `fields` is their union.
 */
export interface QueryDependencies extends Dependencies {
  readonly predicate: ReadonlyArray<FieldDependency>
  readonly order: ReadonlyArray<FieldDependency>
}

export const Expr = {
  /** A constant. Comparisons coerce a plain value, so this is rarely written. */
  literal,

  /**
   * A value the query is given when it runs. A definition builds these from its
   * `Input` schema; written by hand only when constructing a body directly.
   */
  input: <T>(key: string, schema: Schema.Codec<T, unknown>): InputExpr<T> =>
    node({ _tag: 'Input', key, schema }),

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
  ): EqPredicate => node({ _tag: 'Eq', left: toOperand(left), right: toOperand(right as never) }),

  /**
   * Whether a field holds no value. Its opposite is `isNotNull`; both are the
   * one node, because a query asks which of the two it means and nothing here
   * can negate a predicate.
   */
  isNull: <L extends Operand<any>>(operand: L): NullPredicate =>
    node({ _tag: 'Null', operand: toExpr(operand, 'isNull'), present: false }),

  /** Whether a field holds a value. */
  isNotNull: <L extends Operand<any>>(operand: L): NullPredicate =>
    node({ _tag: 'Null', operand: toExpr(operand, 'isNotNull'), present: true }),

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
  contains: <L extends TextOperand>(value: L, search: string | Expr<string>): ContainsPredicate =>
    node({
      _tag: 'Contains',
      value: toExpr(value, 'contains'),
      search: toOperand(search as never),
    }),

  /** An expression as readable text; see `showExpr` for what it is and is not. */
  show: (node: Operandish): string => showExpr(node),
}

/** One term of an ordering: a scalar and the direction to read it in. */
export interface OrderTerm {
  readonly _tag: 'Term'
  readonly direction: 'asc' | 'desc'
  readonly expr: AnyExpr
  /**
   * Where rows without a value go, in the term's own direction. Databases
   * disagree when it is left unsaid (Postgres puts them last ascending, SQLite
   * first), so it is always said: last ascending and first descending unless
   * a term asks otherwise, which is Postgres's.
   */
  readonly nulls: 'first' | 'last'
  /**
   * How text compares, when the term orders text: the term's own, or its
   * field's. None leaves it to the backend, which a client cannot match.
   */
  readonly collation: Option.Option<Collation>
}

/** What a term may say besides its operand. */
export interface TermOptions {
  readonly nulls?: 'first' | 'last' | undefined
  /** Overrides the field's declared collation for this term. */
  readonly collation?: Collation | undefined
}

/** A term, its nulls placed by `options` or by the direction's default. */
const term = (direction: 'asc' | 'desc', expr: AnyExpr, options: TermOptions = {}): OrderTerm =>
  node({
    _tag: 'Term',
    direction,
    expr,
    nulls: options.nulls ?? (direction === 'asc' ? 'last' : 'first'),
    collation: Option.orElse(Option.fromUndefinedOr(options.collation), () =>
      Match.value(expr).pipe(
        Match.tag('Field', field => field.collation),
        Match.orElse(() => Option.none<Collation>()),
      ),
    ),
  })

/** How a list is sorted, as its input holds it: one of its named orders, which way, or none. */
export type ChosenSort<By extends string> = {
  readonly by: By
  readonly direction: 'asc' | 'desc'
} | null

/**
 * An ordering the input chooses: one of several named fields, which way, or
 * none. It is how a list sorts by what its reader picked, said in the body, so
 * the server and the client read one declaration of what each name means.
 */
export interface ChosenOrder {
  readonly _tag: 'Chosen'
  readonly sort: InputExpr<ChosenSort<string>>
  readonly choices: Readonly<Record<string, FieldExpr<unknown>>>
}

/** One entry of a body's ordering: fixed, or chosen by the input. */
export type Ordering = OrderTerm | ChosenOrder

export const Order = {
  /** Smallest first; rows without a value last, unless `nulls` says first. */
  asc: <E extends Operand<any>>(expr: E, options?: TermOptions): OrderTerm =>
    term('asc', toExpr(expr as never, 'asc'), options),
  /** Largest first; rows without a value first, unless `nulls` says last. */
  desc: <E extends Operand<any>>(expr: E, options?: TermOptions): OrderTerm =>
    term('desc', toExpr(expr as never, 'desc'), options),

  /**
   * The order the input names, among `choices`: every name the sort can hold
   * maps to a field, so a name left out is a type error here, not a query that
   * silently orders by nothing. A `null` sort chooses none, and the terms after
   * it decide.
   *
   * ```ts
   * Query.orderBy(Order.chosen(input.sort, { title: Post.fields.title }))
   * ```
   */
  chosen: <By extends string>(
    sort: InputExpr<ChosenSort<By>>,
    choices: { readonly [K in By]: Operand<any> },
  ): ChosenOrder => {
    const fields: Record<string, FieldExpr<unknown>> = Object.create(null)
    for (const [name, choice] of Object.entries<Operand<any>>(choices)) {
      const expr = toExpr(choice as never, 'chosen')
      if (expr._tag !== 'Field') {
        throw new Error(`[foldkit-entity] Order.chosen: "${name}" is not a field`)
      }
      fields[name] = expr
    }
    return node({
      _tag: 'Chosen',
      sort: sort as InputExpr<ChosenSort<string>>,
      choices: Object.freeze(fields),
    })
  },
}

/**
 * Whether a client can order rows the way the server does, for one input: the
 * answer `Query.placement` gives, and the reason when it cannot.
 */
export type Placement =
  { readonly _tag: 'Placeable' } | { readonly _tag: 'NotPlaceable'; readonly reason: string }

const placeable: Placement = Object.freeze({ _tag: 'Placeable' })
const notPlaceable = (reason: string): Placement => Object.freeze({ _tag: 'NotPlaceable', reason })

/** Whether values encoded by `ast` order the same everywhere: numbers and booleans, never text. */
const ordersIntrinsically = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isNumber(ast) ||
  SchemaAST.isBoolean(ast) ||
  (SchemaAST.isLiteral(ast) && typeof ast.literal !== 'string') ||
  (SchemaAST.isUnion(ast) && ast.types.every(ordersIntrinsically))

/** Why a term cannot be placed by a client, if it cannot. */
const unplaceable = (orderTerm: OrderTerm): Option.Option<string> =>
  Match.value(orderTerm.expr).pipe(
    Match.tag('Field', field =>
      Option.match(orderTerm.collation, {
        onNone: () =>
          ordersIntrinsically(Schema.toEncoded(field.schema).ast)
            ? Option.none()
            : Option.some(
                `it orders by ${field.owner.name}.${field.key}, text with no declared collation`,
              ),
        onSome: collation =>
          Match.value(collation).pipe(
            Match.tagsExhaustive({
              Binary: () => Option.none<string>(),
              AsciiFold: () => Option.none<string>(),
              Locale: ({ locale }) =>
                Option.some(
                  `it orders ${field.owner.name}.${field.key} by the backend's "${locale}" collation`,
                ),
            }),
          ),
      }),
    ),
    Match.orElse(() => Option.some('it orders by something that is not a field')),
  )

/** Each Entity's id tie-break, made once, so a resolved order reuses one term. */
const idTerms = new WeakMap<AnyEntity, OrderTerm>()
const idTermOf = (entity: AnyEntity): OrderTerm => {
  const known = idTerms.get(entity)
  if (known !== undefined) return known
  const id = entity.fields.id
  if (id === undefined) {
    throw new Error(`[foldkit-entity] ${entity.name} has no id field to break an order's ties by`)
  }
  const tieBreak = term('asc', fieldExpr(id))
  idTerms.set(entity, tieBreak)
  return tieBreak
}

/** The fixed term a chosen order is for one input, or none for a `null` sort. */
const chosenTerms = (
  chosen: ChosenOrder,
  input: Readonly<Record<string, unknown>>,
): ReadonlyArray<OrderTerm> => {
  const sort = input[chosen.sort.key]
  if (sort === null || sort === undefined) return []
  const picked =
    typeof sort === 'object' && 'by' in sort && typeof sort.by === 'string' ? sort.by : undefined
  const direction = typeof sort === 'object' && 'direction' in sort ? sort.direction : undefined
  if (
    picked === undefined ||
    !Object.hasOwn(chosen.choices, picked) ||
    (direction !== 'asc' && direction !== 'desc')
  ) {
    throw new Error(
      `[foldkit-entity] Order.chosen: $${chosen.sort.key} names no order it offers (${Object.keys(chosen.choices).join(', ')})`,
    )
  }
  return [term(direction, chosen.choices[picked]!)]
}

/** What a walk has found, and the nodes it has already been through. */
interface Found {
  readonly seen: Set<object>
  /** By owner identity, then key: two Entities sharing a name are two entries. */
  readonly fields: Map<symbol, Map<string, FieldDependency>>
  readonly order: Array<FieldDependency>
  readonly inputs: Set<string>
  readonly operations: Set<Operation>
}

/**
 * Visits each node once. A node can be shared by several paths (`eq(n, n)`),
 * and a walk that followed every path would take time exponential in the depth.
 */
const walk = (expr: AnyExpr | Predicate | Ordering, found: Found): void => {
  if (found.seen.has(expr)) return
  found.seen.add(expr)
  switch (expr._tag) {
    case 'Literal':
      return
    case 'Field': {
      const byKey = found.fields.get(expr.owner.token) ?? new Map<string, FieldDependency>()
      found.fields.set(expr.owner.token, byKey)
      if (!byKey.has(expr.key)) {
        const field = { entity: expr.owner.name, key: expr.key, owner: expr.owner }
        byKey.set(expr.key, field)
        found.order.push(field)
      }
      return
    }
    case 'Input':
      found.inputs.add(expr.key)
      return
    case 'Eq':
      found.operations.add('eq')
      walk(expr.left, found)
      walk(expr.right, found)
      return
    case 'Null':
      found.operations.add(expr.present ? 'isNotNull' : 'isNull')
      walk(expr.operand, found)
      return
    case 'Contains':
      found.operations.add('contains')
      walk(expr.value, found)
      walk(expr.search, found)
      return
    case 'Term':
      walk(expr.expr, found)
      return
    case 'Chosen':
      walk(expr.sort, found)
      for (const choice of Object.values(expr.choices)) walk(choice, found)
      return
  }
}

/**
 * What an expression reads and uses, for the planner and for an interpreter
 * deciding whether it can run this query at all. Distinct entries only, in the
 * order first seen, so the answer is stable enough to assert on.
 */
export const dependenciesOf = (
  ...nodes: ReadonlyArray<AnyExpr | Predicate | Ordering>
): Dependencies => {
  const found: Found = {
    seen: new Set(),
    fields: new Map(),
    order: [],
    inputs: new Set(),
    operations: new Set(),
  }
  for (const term of nodes) walk(term, found)
  return { fields: found.order, inputs: [...found.inputs], operations: [...found.operations] }
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
  readonly orderBy: ReadonlyArray<Ordering>
}

/** A `Query` over any Entity, for the places that hold one without caring which. */
export type AnyQuery = Query<AnyEntity>

/** Every field an expression reads, as the nodes themselves, each node visited once. */
const fieldsIn = function* (
  expr: AnyExpr | Predicate | Ordering,
  seen: Set<object>,
): Generator<FieldExpr<unknown>> {
  if (seen.has(expr)) return
  seen.add(expr)
  switch (expr._tag) {
    case 'Field':
      yield expr
      return
    case 'Literal':
    case 'Input':
      return
    case 'Eq':
      yield* fieldsIn(expr.left, seen)
      yield* fieldsIn(expr.right, seen)
      return
    case 'Null':
      yield* fieldsIn(expr.operand, seen)
      return
    case 'Contains':
      yield* fieldsIn(expr.value, seen)
      yield* fieldsIn(expr.search, seen)
      return
    case 'Term':
      yield* fieldsIn(expr.expr, seen)
      return
    case 'Chosen':
      for (const choice of Object.values(expr.choices)) yield* fieldsIn(choice, seen)
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
  nodes: ReadonlyArray<AnyExpr | Predicate | Ordering>,
): void => {
  const seen = new Set<object>()
  for (const term of nodes) {
    for (const field of fieldsIn(term, seen)) {
      if (field.owner.token !== entity.identity.token) {
        throw new Error(
          `[foldkit-entity] Query.${step}: ${what} reads ${field.owner.name}.${field.key}, but the query is from ${entity.name}`,
        )
      }
    }
  }
}

/**
 * The most nodes a query's predicates may hold once every shared node is
 * counted on each path that reaches it. Interpreters read a predicate as a
 * tree: `evaluate` once per row, and the SQL compiler into text that repeats a
 * shared operand wherever it appears. So `eq(n, n)` nested thirty deep is
 * thirty-one objects and a billion nodes of work. Real queries are tens.
 */
export const maxQueryNodes = 1_000

const childrenOf = (expr: AnyExpr | Predicate): ReadonlyArray<AnyExpr | Predicate> => {
  switch (expr._tag) {
    case 'Literal':
    case 'Field':
    case 'Input':
      return []
    case 'Eq':
      return [expr.left, expr.right]
    case 'Null':
      return [expr.operand]
    case 'Contains':
      return [expr.value, expr.search]
  }
}

/** A node's size as a tree, each distinct node sized once. */
const expandedSize = (expr: AnyExpr | Predicate, sizes: Map<object, number>): number => {
  const known = sizes.get(expr)
  if (known !== undefined) return known
  // Capped, so a graph deep enough to overflow a number still compares as too big.
  const size = Math.min(
    maxQueryNodes + 1,
    childrenOf(expr).reduce((sum, child) => sum + expandedSize(child, sizes), 1),
  )
  sizes.set(expr, size)
  return size
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
  orderBy: ReadonlyArray<Ordering>,
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
      const where = [...self.where, ...predicates]
      const sizes = new Map<object, number>()
      const size = where.reduce((sum, predicate) => sum + expandedSize(predicate, sizes), 0)
      if (size > maxQueryNodes) {
        throw new Error(
          `[foldkit-entity] Query.where: the predicates expand to more than ${maxQueryNodes} nodes, counting a shared node on every path that reaches it`,
        )
      }
      return query(self.entity, where, self.orderBy)
    },

  /**
   * Reads the rows in this order. Two `orderBy`s append, so an earlier term
   * stays the more significant one and a later call adds a tie-breaker rather
   * than silently winning.
   */
  orderBy:
    (...terms: ReadonlyArray<Ordering>) =>
    <E extends AnyEntity>(self: Query<E>): Query<E> => {
      if (terms.length === 0) return self
      checkOwnership('orderBy', 'a term', self.entity, terms)
      return query(self.entity, self.where, [...self.orderBy, ...terms])
    },

  /**
   * The fixed terms this query orders by for one input: each chosen order
   * resolved to the field its input names, or to nothing for a `null` sort,
   * and the Entity's id last, ascending, unless the terms already read it. So
   * the order is total, and every interpreter breaks ties the same way: one
   * that broke them its own way would place rows a step apart from another.
   */
  orderFor: (
    self: AnyQuery,
    input: Readonly<Record<string, unknown>>,
  ): ReadonlyArray<OrderTerm> => {
    const terms = self.orderBy.flatMap(entry =>
      Match.value(entry).pipe(
        Match.tagsExhaustive({
          Term: term => [term],
          Chosen: chosen => chosenTerms(chosen, input),
        }),
      ),
    )
    const id = idTermOf(self.entity)
    // Every field an order reads is this Entity's: `orderBy` refuses another's.
    const endsOnId = terms.some(term => term.expr._tag === 'Field' && term.expr.key === 'id')
    return endsOnId ? terms : [...terms, id]
  },

  /**
   * Whether a client can order this query's rows exactly as the server does,
   * for one input: every term over a number or a boolean, or over text with a
   * portable collation (`binary`, `asciiFold`). A body that names no order
   * leaves it to the server, and is never placeable.
   */
  placement: (self: AnyQuery, input: Readonly<Record<string, unknown>>): Placement => {
    if (self.orderBy.length === 0) {
      return notPlaceable("its order is the server's: the body names none")
    }
    for (const orderTerm of Query.orderFor(self, input)) {
      const reason = unplaceable(orderTerm)
      if (Option.isSome(reason)) return notPlaceable(reason.value)
    }
    return placeable
  },

  /**
   * What the whole query reads: the fields and inputs of every predicate and
   * every ordering term, and the operations it uses, with the fields also
   * split by role.
   */
  dependencies: (self: AnyQuery): QueryDependencies => ({
    ...dependenciesOf(...self.where, ...self.orderBy),
    predicate: dependenciesOf(...self.where).fields,
    order: dependenciesOf(...self.orderBy).fields,
  }),

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
              .map(entry =>
                Match.value(entry).pipe(
                  Match.tagsExhaustive({
                    Term: term => `${Expr.show(term.expr)} ${term.direction.toUpperCase()}`,
                    Chosen: chosen =>
                      `$${chosen.sort.key} among (${Object.entries(chosen.choices)
                        .map(([name, field]) => `${name}: ${Expr.show(field)}`)
                        .join(', ')})`,
                  }),
                ),
              )
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

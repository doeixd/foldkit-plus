/**
 * Compiles a query's body — the source-neutral `Expr` value a
 * `Query.define` carries — into the Drizzle `where` and `orderBy` this
 * package already runs.
 *
 * The body says what the query means; this says what that means *here*. A
 * binding knows which column holds which field, so nothing in the body names a
 * table, and the same body can be compiled by something else entirely.
 *
 * What this does not do is decide what a principal may see. A compiled `where`
 * is conjoined with the binding's own `visible` rule by the caller, exactly as
 * a hand-written one is: a query body is the application's question, never its
 * authorization.
 */
import {
  Column,
  eq,
  gt,
  gte,
  inArray,
  is,
  lt,
  lte,
  isNotNull,
  isNull,
  sql,
  type AnyColumn,
  type SQL,
  type Table,
} from 'drizzle-orm'
import { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import { Match, Option, Schema, SchemaAST } from 'effect'
import { absurd } from 'effect/Function'
import {
  Computation,
  Expr,
  Query,
  QueryEvaluateError,
  SchemaShape,
  decided,
  isPredicate,
  contextValue,
  type Collation,
  type EntityIdentity,
  type ExistsPredicate,
  type ExprContext,
  type OneRelation,
  type PathExpr,
  dependenciesOf,
  type NowExpr,
  type ViewerExpr,
} from 'foldkit-entity'
import type {
  AnyExpr,
  AnyQuery,
  CallExpr,
  EqPredicate,
  OrderTerm as ExprOrderTerm,
  Operandish,
  CompareOperator,
  ComparePredicate,
  Operation,
  OperatorDescriptor,
  Predicate,
  PredicateTruth,
  Ordering,
  TestPredicate,
} from 'foldkit-entity'
import type { RelationBinding } from './binding.js'
import { collatedColumn, type OrderTerm } from './cursor.js'
import { kernelOperators, type BindingOperators } from './operators.js'

/**
 * What a binding has to offer to be compiled against: a column per field key,
 * and the table, whose dialect decides how text folds.
 */
export interface CompileTarget {
  readonly table: Table
  readonly columns: Record<string, AnyColumn>
  /**
   * Each field as the row a write would leave holds it, where a rule over a
   * change reads one (`Next`): a moved or computed field is its expression, and
   * a field it does not name is its column, which a write that leaves the field
   * alone leaves as it is.
   */
  readonly next?: Readonly<Record<string, AnyColumn | SQL>>
  /**
   * How primitive operators are run: in SQL, and in memory for a predicate
   * decided from the input alone. Both kernels when not given.
   */
  readonly operators?: BindingOperators | undefined
  /**
   * What `Expr.viewer` and `Expr.now` read for this request: the server's
   * viewer of the principal, and its clock. A body reading either is refused
   * where none is given.
   */
  readonly context?: ExprContext | undefined
  /** Its `one` relations, by key: a path leaves this table by one stored here (`{ field }`). */
  readonly relations?: Readonly<Record<string, RelationBinding>> | undefined
  /** The binding of each Entity a path or an exists may reach, by identity; `bind` sets it. */
  readonly reach?: ((owner: EntityIdentity<string>) => Option.Option<CompileTarget>) | undefined
  /**
   * The rows this request's reader may see of each table reached: its
   * `visible`, resolved for the principal. A body that reaches another table
   * is refused without it, rather than read rows its reader may not see.
   */
  readonly visibleOf?: ((owner: EntityIdentity<string>) => Option.Option<SQL>) | undefined
}

/** The binding a path or an exists reaches, refused by name where none is bound. */
const reachedTable = (
  target: CompileTarget,
  owner: EntityIdentity<string>,
  query: string,
): CompileTarget =>
  Option.getOrThrowWith(
    Option.flatMap(Option.fromUndefinedOr(target.reach), reach => reach(owner)),
    () =>
      new QueryCompileError(
        `query "${query}" reaches ${owner.name}, which is not bound beside it; bind the Entities together with \`bind\``,
      ),
  )

/** The column a `one` relation is stored on, in its owner's own table. */
const linkOf = (table: CompileTarget, relation: OneRelation, query: string): AnyColumn => {
  const stored =
    table.relations !== undefined && Object.hasOwn(table.relations, relation.key)
      ? table.relations[relation.key]
      : undefined
  if (stored?.kind !== 'one') {
    throw new QueryCompileError(
      `query "${query}" goes through ${relation.owner.name}.${relation.key}, which is not stored on ${relation.owner.name}'s own table ({ field })`,
    )
  }
  return stored.field
}

/** The rows of a reached table this request's reader may see. */
const visibleIn = (target: CompileTarget, owner: EntityIdentity<string>, query: string) =>
  Option.getOrThrowWith(
    Option.fromUndefinedOr(target.visibleOf),
    () =>
      new QueryCompileError(
        `query "${query}" reaches ${owner.name}, but was compiled without what its reader may see of it`,
      ),
  )(owner)

/**
 * What `read` makes of the row `via` reaches from `from`: a scalar subquery
 * per relation, each under its table's visibility, so a null link or a row
 * the reader may not see reads null, as `Judge` reads a path that reaches no
 * row. Each subquery reads only the row around it, so no alias is needed
 * while no table repeats along the way (`checkFields` refuses one that does).
 */
const atRow = (
  from: CompileTarget,
  via: ReadonlyArray<OneRelation>,
  read: (at: CompileTarget) => SQL,
  query: string,
): SQL => {
  const [first, ...rest] = via
  if (first === undefined) return read(from)
  const link = linkOf(from, first, query)
  const owner = first.target().identity
  const next = reachedTable(from, owner, query)
  const visible = visibleIn(from, owner, query)
  const at = eq(columnFor(next, 'id', query), link)
  const where = Option.match(visible, {
    onNone: () => at,
    onSome: rule => sql`${at} and (${rule})`,
  })
  return sql`(select ${atRow(onward(from, next), rest, read, query)} from ${next.table} where ${where})`
}

/** A reached binding, compiled for the request its query was: the same reader and context. */
const onward = (from: CompileTarget, next: CompileTarget): CompileTarget => ({
  ...next,
  visibleOf: from.visibleOf,
  context: from.context,
})

/**
 * Whether a row pointing at `anchor`'s row through the exists' relation holds
 * its filter, among the rows its reader may see: `exists (select 1 …)`.
 */
const existsAt = (
  node: ExistsPredicate,
  anchor: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): SQL => {
  const owner = node.relation.owner
  const pointing = onward(anchor, reachedTable(anchor, owner, query))
  const conditions = [
    eq(linkOf(pointing, node.relation, query), columnFor(anchor, 'id', query)),
    ...Option.toArray(Option.map(node.where, where => predicate(where, pointing, input, query))),
    ...Option.toArray(Option.map(visibleIn(anchor, owner, query), rule => sql`(${rule})`)),
  ]
  return sql`exists (select 1 from ${pointing.table} where ${sql.join(conditions, sql` and `)})`
}

/** A context term's value for this request, as a parameter binds it. */
const contextFor = (
  node: ViewerExpr<unknown> | NowExpr<unknown>,
  target: CompileTarget,
  query: string,
): unknown => {
  if (target.context === undefined) {
    throw new QueryCompileError(
      `query "${query}" reads ${Expr.show(node)}, but was compiled with no context to read it from`,
    )
  }
  const value = Option.getOrThrowWith(
    contextValue(node, target.context),
    () => new QueryCompileError(`query "${query}" reads ${Expr.show(node)}, but was given no time`),
  )
  return bindable(value, target)
}

const operatorsOf = (target: CompileTarget): BindingOperators => target.operators ?? kernelOperators

const dialectOf = (target: CompileTarget): 'sqlite' | 'postgres' =>
  is(target.table, PgTable) ? 'postgres' : 'sqlite'

/** Text under a collation as `dialect` writes it (expr-operations-DESIGN §7); itself under none. */
const collateFor =
  (collation: Option.Option<Collation>, dialect: 'sqlite' | 'postgres') =>
  (text: SQL): SQL =>
    Option.match(collation, {
      onNone: () => text,
      onSome: each =>
        Match.value(each).pipe(
          Match.tagsExhaustive({
            Binary: () =>
              dialect === 'postgres' ? sql`(${text} collate "C")` : sql`(${text} collate binary)`,
            AsciiFold: () =>
              dialect === 'postgres'
                ? sql`lower(${text} collate "C")`
                : sql`(${text} collate nocase)`,
            // A call carrying a locale is refused where it is written; nothing reaches here with one.
            Locale: ({ locale }) => {
              throw new QueryCompileError(
                `text under the backend's "${locale}" collation is not compared by a call`,
              )
            },
          }),
        ),
    })

/**
 * The SQL type a parameter is cast to on Postgres, which reads an untyped
 * parameter as text: `$1 + $2` is refused as "operator is not unique". An
 * integer is an `integer` while the value fits one, which every function
 * taking an integer resolves for (`left(text, int)` resolves no `bigint`), and
 * a `bigint` past 32 bits, which `Schema.Int` admits. Text needs none.
 */
const castFor = (schema: Schema.Top, value: unknown): Option.Option<SQL> => {
  const present = SchemaShape.present(Schema.toEncoded(schema).ast)
  if (present.length > 0 && present.every(SchemaAST.isNumber)) {
    if (!present.every(SchemaShape.holdsIntegers)) return Option.some(sql.raw('double precision'))
    const fits = typeof value !== 'number' || (value >= -(2 ** 31) && value < 2 ** 31)
    return Option.some(fits ? sql.raw('integer') : sql.raw('bigint'))
  }
  if (present.length > 0 && present.every(SchemaAST.isBoolean))
    return Option.some(sql.raw('boolean'))
  return Option.none()
}

/**
 * A literal or input value an operator takes, as a parameter: cast by the input
 * it fills on Postgres. SQLite takes no cast (its `cast(? as integer)` would
 * truncate `0.5` silently), and is given it as it binds (`bindable`).
 */
const parameterSql = (
  value: unknown,
  schema: Option.Option<Schema.Top>,
  target: CompileTarget,
): SQL =>
  dialectOf(target) === 'sqlite'
    ? sql`${bindable(value, target)}`
    : Option.match(
        Option.flatMap(schema, each => castFor(each, value)),
        {
          onNone: () => sql`${value}`,
          onSome: type => sql`cast(${value} as ${type})`,
        },
      )

/** Whether a scalar is bound as a parameter: a value given, not a column or a call. */
const isParameter = (node: AnyExpr): boolean =>
  Match.value(node).pipe(
    Match.tags({ Literal: () => true, Input: () => true, Viewer: () => true, Now: () => true }),
    Match.orElse(() => false),
  )

/** One argument of a call, as SQL: a column, a parameter, a call's SQL or a predicate's. */
const argumentSql = (
  arg: Operandish,
  schema: Schema.Top,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): SQL => {
  if (isPredicate(arg)) return predicate(arg, target, input, query)
  const value = operand(arg, target, input, query)
  if (!isParameter(arg)) return sql`${value}`
  if (holdsNul(value)) {
    throw new QueryCompileError(
      `query "${query}" gives an operator text holding a NUL character, which SQL text cannot hold portably`,
    )
  }
  return parameterSql(value, Option.some(schema), target)
}

/**
 * A computed assignment, as data, as the SQL that writes it: a field its
 * column, a value a parameter (cast as a call's argument is, by the operator
 * input it fills), a call by the binding's SQL operators under the collation
 * it carries. What `writer` sets, in the statement that writes.
 */
export const computationSql = (
  computation: Computation,
  target: CompileTarget,
  query: string,
): SQL => computedSql(computation, Option.none(), target, query)

const computedSql = (
  computation: Computation,
  schema: Option.Option<Schema.Top>,
  target: CompileTarget,
  query: string,
): SQL =>
  Computation.$match(computation, {
    Field: ({ key }) => sql`${columnFor(target, key, query)}`,
    Value: ({ value }) => {
      if (holdsNul(value)) {
        throw new QueryCompileError(
          `${query} computes from text holding a NUL character, which SQL text cannot hold portably`,
        )
      }
      return parameterSql(value, schema, target)
    },
    Call: ({ operator, args, collation }) => {
      const tables = operatorsOf(target)
      const descriptor = Option.getOrThrowWith(
        tables.sql.named(operator),
        () =>
          new QueryCompileError(
            `${query} computes by the operator "${operator}", which this binding's SQL operators do not run`,
          ),
      )
      const build = Option.getOrThrowWith(tables.sql.get(descriptor), () =>
        unrun(descriptor, query),
      )
      const dialect = dialectOf(target)
      const under = Option.fromNullOr(collation)
      return build({
        args: args.map((arg, position) =>
          computedSql(arg, Option.fromUndefinedOr(descriptor.input[position]), target, query),
        ),
        dialect,
        collation: under,
        collate: collateFor(under, dialect),
      })
    },
  })

/** A call of a primitive operator, as its SQL implementation builds it. */
const callSql = (
  call: CallExpr<unknown> | TestPredicate,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): SQL => {
  const build = Option.getOrThrowWith(operatorsOf(target).sql.get(call.operator), () =>
    unrun(call.operator, query),
  )
  const dialect = dialectOf(target)
  return build({
    args: call.args.map((arg, position) =>
      argumentSql(arg, call.operator.input[position]!, target, input, query),
    ),
    dialect,
    collation: call.collation,
    collate: collateFor(call.collation, dialect),
  })
}

export class QueryCompileError extends Error {
  constructor(message: string) {
    super(`[foldkit-remote-drizzle] ${message}`)
    this.name = 'QueryCompileError'
  }
}

/**
 * The column a field is stored in, or a `one` relation read as an operand
 * (the id it points at): the column it is stored on, in this table.
 */
const columnFor = (target: CompileTarget, key: string, query: string): AnyColumn => {
  if (Object.hasOwn(target.columns, key)) return target.columns[key]!
  const link =
    target.relations !== undefined && Object.hasOwn(target.relations, key)
      ? target.relations[key]
      : undefined
  if (link !== undefined) {
    if (link.kind !== 'one') {
      throw new QueryCompileError(
        `query "${query}" reads the relation "${key}" as a value, but it is not stored on this table ({ field })`,
      )
    }
    return link.field
  }
  throw new QueryCompileError(
    `query "${query}" reads the field "${key}", which the binding has no column for`,
  )
}

/**
 * The value an operand contributes. A field is a column; a literal is itself;
 * an input is whatever this request was given, read by the key the placeholder
 * was built with.
 */
const operand = (
  node: AnyExpr,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): AnyColumn | unknown => {
  switch (node._tag) {
    case 'Field':
      return columnFor(target, node.key, query)
    case 'Next':
      return Object.hasOwn(target.next ?? {}, node.field.key)
        ? target.next![node.field.key]!
        : columnFor(target, node.field.key, query)
    case 'Literal':
      return bindable(node.value, target)
    case 'Input':
      return bindable(input[node.key], target)
    // Expanded before compiling: a call left is a primitive operator, built here.
    case 'Call':
      return callSql(node, target, input, query)
    case 'Viewer':
    case 'Now':
      return contextFor(node, target, query)
    case 'Path':
      return atRow(target, node.via, at => sql`${columnFor(at, node.field.key, query)}`, query)
    default:
      return absurd(node)
  }
}

/**
 * A value as the database binds it. SQLite binds no boolean and stores one as 1
 * or 0, which a boolean column's own encoder writes too; so a value compared
 * with what no column encodes (a computed value, a call) is 1 or 0 already.
 */
const bindable = (value: unknown, target: CompileTarget): unknown =>
  typeof value === 'boolean' && dialectOf(target) === 'sqlite' ? Number(value) : value

/** An operator this compiler cannot run: one with no definition to compile instead. */
const unrun = (operator: OperatorDescriptor, query: string): QueryCompileError =>
  new QueryCompileError(
    `query "${query}" calls the operator "${operator.version === 1 ? operator.id : `${operator.id}@${operator.version}`}", which this binding's SQL operators do not run`,
  )

/**
 * Whether `value` is text holding a NUL, which Postgres text cannot hold and
 * SQLite compares only up to: the reference interpreter refuses it too. Only an
 * input or a literal is seen here; a NUL inside a stored column is not.
 */
const holdsNul = (value: unknown): boolean =>
  typeof value === 'string' && value.includes(String.fromCharCode(0))

/**
 * NaN as a parameter: SQLite binds it as null and Postgres orders it after
 * every number, so `evaluate` refuses it and so does this.
 */
const refuseNaN = (query: string, values: ReadonlyArray<unknown>): void => {
  if (values.some(value => typeof value === 'number' && Number.isNaN(value))) {
    throw new QueryCompileError(
      `query "${query}" compares NaN, which SQLite stores as null and Postgres orders after every number`,
    )
  }
}

/** A predicate used as a value: `(archived_at is not null) = ?` compares one. */
const side = (
  node: Operandish,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): AnyColumn | SQL | unknown =>
  isPredicate(node) ? predicate(node, target, input, query) : operand(node, target, input, query)

/** `%` and `_` are wildcards, so text searched for has to say it means them literally. */
const escapeLike = (value: string): string => value.replace(/[\\%_]/g, found => `\\${found}`)

/**
 * Drizzle's `not` takes `undefined` for an optional condition and answers
 * `undefined` for it, so rc.5 typed its return as optional. A predicate here is
 * always present, and the SQL is the same `not (…)` rc.4 emitted.
 */
const negate = (condition: SQL): SQL => sql`not (${condition})`

/**
 * `eq(somePredicate, aBoolean)` asked directly: the predicate when the boolean
 * is true, and its negation when false. `undefined` when this comparison is not
 * of that shape, which leaves it to ordinary equality.
 *
 * A `Null` negates by flipping which answer absence gives, so the SQL stays
 * `is null` / `is not null` rather than `not (… is not null)`.
 */
const truthComparison = (
  node: EqPredicate,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): SQL | undefined => {
  const [asked, against] = isPredicate(node.left)
    ? [node.left, node.right]
    : isPredicate(node.right)
      ? [node.right, node.left]
      : [undefined, undefined]
  if (asked === undefined || against === undefined || isPredicate(against)) return undefined
  const value = operand(against, target, input, query)
  if (typeof value !== 'boolean') return undefined
  if (value) return predicate(asked, target, input, query)
  if (asked._tag === 'Null') {
    return predicate({ ...asked, present: !asked.present }, target, input, query)
  }
  return negate(predicate(asked, target, input, query))
}

/**
 * A predicate that reads no field, decided with this request's input, so it
 * reaches the database as a constant, or is dropped from the `and` or `or`
 * around it: `isNull($status)` is known now, and an `or` it is in is then
 * `true` or just its other operand.
 */
const decide = (
  node: Predicate,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): Option.Option<PredicateTruth> => {
  try {
    return decided(node, input, operatorsOf(target).memory, target.context)
  } catch (error) {
    if (error instanceof QueryEvaluateError) {
      throw new QueryCompileError(
        `query "${query}": ${error.message.replace('[foldkit-entity] ', '')}`,
      )
    }
    throw error
  }
}

/** A decided truth as SQL: unknown is SQL's null, which `and`, `or` and `not` keep as SQL does. */
const constant = (truth: PredicateTruth): SQL =>
  truth === 'unknown' ? sql`null` : truth ? sql`true` : sql`false`

/**
 * An `and` or an `or`, its decided operands settled: in an `and`, false makes
 * the whole false and true drops out, and the reverse in an `or`; an unknown
 * stays, as null. Every operand is compiled before any decides the whole, so
 * one that refuses its input refuses here as `evaluate` would.
 */
const connective = (
  operands: ReadonlyArray<Predicate>,
  joiner: 'and' | 'or',
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): SQL => {
  const decisive = joiner === 'or'
  const parts = operands.map(each =>
    Option.match(decide(each, target, input, query), {
      onNone: (): SQL | PredicateTruth => predicate(each, target, input, query),
      onSome: (truth): SQL | PredicateTruth => truth,
    }),
  )
  if (parts.includes(decisive)) return constant(decisive)
  const kept = parts.flatMap((part): ReadonlyArray<SQL> =>
    typeof part === 'boolean' ? [] : part === 'unknown' ? [sql`null`] : [part],
  )
  if (kept.length === 0) return constant(!decisive)
  if (kept.length === 1) return kept[0]!
  return sql`(${sql.join(kept, joiner === 'and' ? sql` and ` : sql` or `)})`
}

/** Whether an operand reads a column: a field, before a write or after it. */
const isColumn = (node: Operandish): boolean =>
  !isPredicate(node) &&
  Match.value(node).pipe(
    Match.tagsExhaustive({
      Field: () => true,
      Next: () => true,
      Call: () => true,
      Path: () => true,
      Literal: () => false,
      Input: () => false,
      Viewer: () => false,
      Now: () => false,
    }),
  )

/** The same comparison with its sides swapped: `3 > rank` is `rank < 3`. */
const flipped: Readonly<Record<CompareOperator, CompareOperator>> = {
  lt: 'gt',
  lte: 'gte',
  gt: 'lt',
  gte: 'lte',
}
const symbols: Readonly<Record<CompareOperator, string>> = {
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
}
const comparing = { lt, lte, gt, gte }

/**
 * A comparison, column first as a binding writes one: Drizzle's own operator
 * over a number, so the value is encoded as the column's type, and text under
 * its collation as the cursor applies one (`collate binary` on SQLite,
 * `collate "C"` on Postgres text, both sides lowered for ASCII folding).
 */
const comparison = (
  node: ComparePredicate,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): SQL => {
  const fieldFirst = isColumn(node.left) || !isColumn(node.right)
  const [first, second, operator] = fieldFirst
    ? [node.left, node.right, node.operator]
    : [node.right, node.left, flipped[node.operator]]
  const left = operand(first, target, input, query)
  const right = operand(second, target, input, query)
  if (holdsNul(left) || holdsNul(right)) {
    throw new QueryCompileError(
      `query "${query}" compares text holding a NUL character, which SQL text cannot hold portably`,
    )
  }
  refuseNaN(query, [left, right])
  const symbol = sql.raw(symbols[operator])
  return Option.match(node.collation, {
    onNone: () =>
      isColumn(first)
        ? comparing[operator](left as AnyColumn, right)
        : sql`${left} ${symbol} ${right}`,
    // Text compares only against a field or a call carrying a collation, which the
    // swap above put first. A call is no column, so its collation is applied by rule.
    onSome: collation => {
      // A call, or a computed `Next`, on either side is an expression, not a
      // column, so its collation is applied by rule.
      if (!is(left, Column) || (isColumn(second) && !is(right, Column))) {
        const collate = collateFor(Option.some(collation), dialectOf(target))
        return sql`${collate(sql`${left}`)} ${symbol} ${collate(sql`${right}`)}`
      }
      const column = left as AnyColumn
      const under = collatedColumn(column, collation)
      const key = Option.match(under, { onNone: () => sql`${column}`, onSome: ({ key }) => key })
      const value = isColumn(second)
        ? Option.match(collatedColumn(right as AnyColumn, collation), {
            onNone: () => sql`${right}`,
            onSome: ({ key }) => key,
          })
        : Option.match(under, {
            onNone: () => sql`${right}`,
            onSome: ({ value }) => sql`${value(right)}`,
          })
      return sql`${key} ${symbol} ${value}`
    },
  })
}

/**
 * A predicate as SQL, decided first when it reads no field: such a predicate
 * sent as parameters is not the question it was (`$1 < $2` compares untyped
 * parameters, and matched nothing for 9 < 10), and deciding it here keeps the
 * SQL to what the rows decide.
 */
const predicate = (
  node: Predicate,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): SQL =>
  Option.match(decide(node, target, input, query), {
    onSome: constant,
    onNone: () => undecided(node, target, input, query),
  })

/** A predicate that reads a field, as SQL. */
const undecided = (
  node: Predicate,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): SQL => {
  switch (node._tag) {
    case 'Exists':
      return atRow(target, node.via, at => existsAt(node, at, input, query), query)
    case 'Test':
      return callSql(node, target, input, query)
    case 'And':
      return connective(node.operands, 'and', target, input, query)
    case 'Or':
      return connective(node.operands, 'or', target, input, query)
    case 'Not':
      return negate(predicate(node.operand, target, input, query))
    case 'Compare':
      return comparison(node, target, input, query)
    case 'Eq': {
      // A predicate compared to a boolean is that predicate, or its negation.
      // The value is known here — this runs per request, with the input in
      // hand — so it is settled now rather than sent to the database as a
      // boolean parameter, which dialects disagree about even having. The SQL
      // is then exactly what a hand-written `archived ? isNotNull : isNull`
      // produced, which is the point.
      const asked = truthComparison(node, target, input, query)
      if (asked !== undefined) return asked
      const left = side(node.left, target, input, query)
      const right = side(node.right, target, input, query)
      if (holdsNul(left) || holdsNul(right)) {
        throw new QueryCompileError(
          `query "${query}" compares text holding a NUL character, which SQL text cannot hold portably`,
        )
      }
      refuseNaN(query, [left, right])
      // Drizzle's `eq` wants a column or expression on the left; a body may
      // compare either way round, and equality does not care. Normalising keeps
      // the generated SQL the shape a binding would have been written in.
      return isPredicate(node.left) || isColumn(node.left)
        ? eq(left as AnyColumn, right)
        : eq(right as AnyColumn, left)
    }
    case 'Null': {
      const column = operand(node.operand, target, input, query) as AnyColumn
      return node.present ? isNotNull(column) : isNull(column)
    }
    case 'Contains': {
      const value = operand(node.value, target, input, query)
      const search = side(node.search, target, input, query)
      // Preserve unknown under a surrounding boolean comparison or negation.
      if (search === null) return sql`null`
      if (typeof search !== 'string') {
        throw new QueryCompileError(`query "${query}" searches for something that is not text`)
      }
      // Postgres text cannot hold NUL and SQLite's `like` stops at it, so text
      // holding one means nothing portable; the reference interpreter refuses
      // it too. Only the search is checked: a searched value that is not a
      // field reads none, so `predicate` decided it, and a NUL inside a stored
      // column is not seen here.
      if (holdsNul(search)) {
        throw new QueryCompileError(
          `query "${query}" searches text holding a NUL character, which SQL text cannot hold portably`,
        )
      }
      // Folded on both sides rather than left to `like`, which is
      // case-insensitive in SQLite and case-sensitive in Postgres: a query body
      // that means two things by dialect is the thing this package exists to
      // stop. The fold is ASCII only, as `Expr.contains` documents and
      // `evaluate` does: SQLite's `lower` folds ASCII alone, but Postgres's
      // follows the collation (`É` to `é` under a UTF-8 one), except the `C`
      // collation, which folds ASCII alone too. Decided by the table, not the
      // operand: the searched value may be an input rather than a column.
      const pattern = `%${escapeLike(search)}%`
      return is(target.table, PgTable)
        ? sql`lower(${value} collate "C") like lower(${pattern} collate "C") escape '\\'`
        : sql`lower(${value}) like lower(${pattern}) escape '\\'`
    }
    case 'In': {
      const among = operand(node.among, target, input, query)
      if (!Array.isArray(among)) {
        throw new QueryCompileError(
          `query "${query}" asks whether a value is in something that is not a list`,
        )
      }
      // An empty list matches nothing, which SQLite and Postgres would say
      // differently (`in ()`): over a field, Drizzle's `inArray` writes `false`
      // itself, and over anything else this reads no field, so `predicate`
      // decided it.
      const value = operand(node.value, target, input, query)
      if (holdsNul(value) || among.some(holdsNul)) {
        throw new QueryCompileError(
          `query "${query}" asks about text holding a NUL character, which SQL text cannot hold portably`,
        )
      }
      refuseNaN(query, [value, ...among])
      // Over a column, Drizzle encodes each element as the column's own type,
      // as `eq` does; anything else is compared as it is.
      return isColumn(node.value)
        ? inArray(value as AnyColumn, among)
        : sql`${value} in (${sql.join(
            among.map(each => sql`${each}`),
            sql`, `,
          )})`
    }
  }
}

/**
 * The operations this compiler turns into SQL. Declared rather than implied by
 * which cases `predicate` happens to handle, so a body needing something else
 * is refused with a name instead of falling through.
 */
export const supported: ReadonlyArray<Operation> = [
  'eq',
  'isNull',
  'isNotNull',
  'contains',
  'in',
  'and',
  'or',
  'not',
  'compare',
  'viewer',
  'now',
]

/**
 * What a query body may use besides: paths and exists, which read other
 * tables under the reader's visibility, resolved per request. A rule that is
 * not a body (an invariant, a `when`, a Read rule) does not reach another
 * table yet, and is refused one by `supported`.
 */
const bodyOperations: ReadonlyArray<Operation> = [...supported, 'path', 'exists']

/**
 * Every Entity a body's paths and exists reach, once each: the tables whose
 * `visible` a request resolves for its reader before compiling (`visibleOf`).
 */
export const reachedEntities = (body: AnyQuery): ReadonlyArray<EntityIdentity<string>> => {
  const owners = new Map<symbol, EntityIdentity<string>>()
  for (const reached of Query.dependencies(body).reaches) {
    const met = [
      ...reached.via.map(relation => relation.target().identity),
      ...(reached._tag === 'Exists' ? [reached.relation.owner] : []),
    ]
    for (const owner of met) owners.set(owner.token, owner)
  }
  return [...owners.values()]
}

/**
 * Refuses, where a query is registered, a path or an exists this binding
 * cannot compile: a relation not stored on its owner's own table, an Entity
 * not bound beside this one, a field with no column, or a table met twice,
 * which would need SQL aliases this compiler does not write.
 */
const checkReach = (
  reached: PathExpr<unknown> | ExistsPredicate,
  target: CompileTarget,
  query: string,
): void => {
  const met = [target.table]
  const meet = (table: CompileTarget, owner: EntityIdentity<string>): void => {
    if (met.includes(table.table)) {
      throw new QueryCompileError(
        `query "${query}" reaches ${owner.name}'s table twice in ${Expr.show(reached)}, which this compiler cannot alias yet`,
      )
    }
    met.push(table.table)
  }
  let at = target
  for (const relation of reached.via) {
    const owner = relation.target().identity
    const next = reachedTable(at, owner, query)
    linkOf(at, relation, query)
    at = next
    meet(at, owner)
  }
  if (reached._tag === 'Path') {
    columnFor(at, reached.field.key, query)
    return
  }
  const pointing = reachedTable(at, reached.relation.owner, query)
  meet(pointing, reached.relation.owner)
  linkOf(pointing, reached.relation, query)
  columnFor(at, 'id', query)
  Option.map(reached.where, where => {
    for (const field of dependenciesOf(where).fields) columnFor(pointing, field.key, query)
  })
}

/**
 * Every field the body reads has a column here, every operation it needs is
 * one this compiler runs, and every order it may take (each `Order.chosen`
 * alternative too) compiles here. Checked once, when the source is registered,
 * so a server that starts is a server whose queries can be answered — rather
 * than one that fails on whichever request first runs this query.
 */
export const checkFields = (body: AnyQuery, target: CompileTarget, query: string): void => {
  requireOperators([...body.where, ...body.orderBy], target, `query "${query}"`, bodyOperations)
  const read = Query.dependencies(body)
  for (const field of read.fields) columnFor(target, field.key, query)
  for (const reached of read.reaches) checkReach(reached, target, query)
  const ordered = body.orderBy.flatMap(ordering =>
    Match.valueTags(ordering, {
      Term: ({ expr, collation }) => [{ expr, collation }],
      Chosen: ({ choices }) =>
        Object.values(choices).map(expr => ({ expr, collation: expr.collation })),
    }),
  )
  for (const { expr, collation } of ordered) {
    if (expr._tag === 'Field')
      localeOnSqlite(columnFor(target, expr.key, query), expr.key, collation, query)
  }
}

/** Refuses ordering a column by a locale where the database has none: SQLite. */
const localeOnSqlite = (
  column: AnyColumn,
  key: string,
  collation: Option.Option<Collation>,
  query: string,
): void =>
  Option.match(collation, {
    onNone: () => undefined,
    onSome: each => {
      if (each._tag === 'Locale' && !is(column, PgColumn)) {
        throw new QueryCompileError(
          `query "${query}" orders "${key}" by the "${each.locale}" collation, and SQLite has no locales`,
        )
      }
    },
  })

/**
 * Refuses expressions needing an operation or operator the binding cannot run:
 * in SQL, or in memory, where a predicate over the input alone is decided and
 * a write's miss explained (expr-operations-DESIGN §5.6). Called where each is
 * registered or built, so a server that starts can run what it serves.
 */
export const requireOperators = (
  nodes: ReadonlyArray<AnyExpr | Predicate | Ordering>,
  target: CompileTarget,
  what: string,
  operations: ReadonlyArray<Operation> = supported,
): void => {
  const [problem] = operatorProblems(nodes, target, what, operations)
  if (problem !== undefined) throw new QueryCompileError(problem)
}

/** As `requireOperators`, each problem a sentence, for a check that gathers them. */
export const operatorProblems = (
  nodes: ReadonlyArray<AnyExpr | Predicate | Ordering>,
  target: CompileTarget,
  what: string,
  operations: ReadonlyArray<Operation> = supported,
): ReadonlyArray<string> => {
  const tables = operatorsOf(target)
  const inSql = Expr.unsupported(nodes, { operations, operators: tables.sql })
  if (inSql.length > 0)
    return [`${what} needs ${inSql.join(', ')}, which this compiler does not run`]
  const inMemory = Expr.unsupported(nodes, { operations, operators: tables.memory })
  return inMemory.length > 0
    ? [`${what} needs ${inMemory.join(', ')}, which this binding's memory operators do not run`]
    : []
}

/**
 * The body's predicates, as the SQL fragments this request needs. Each is
 * separate: the caller conjoins them with whatever else applies, so a body
 * cannot escape the binding's visibility rule by being one big expression.
 */
export const compileWhere = (
  body: AnyQuery,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): ReadonlyArray<SQL> => compilePredicates(body.where, target, input, query)

/** Predicates with no body around them, as SQL fragments: an invariant's, say. */
export const compilePredicates = (
  predicates: ReadonlyArray<Predicate>,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): ReadonlyArray<SQL> =>
  // Each defined operator is compiled as what it means, so its SQL is what writing that out gives.
  predicates.map(node => predicate(Expr.expanded(node), target, input, query))

/**
 * One call of a primitive operator as SQL, by the binding's table, its
 * arguments compiled and cast as in a body: what a conformance check selects
 * to ask the database one question (`select <call>`). Never decided in memory,
 * though its arguments read no row; a call of a defined operator, which has no
 * SQL of its own, is refused, as is anything that is not a call.
 */
export const compileCall = (call: Operandish, target: CompileTarget, query: string): SQL => {
  if (isPredicate(call)) {
    if (call._tag === 'Test') return callSql(call, target, {}, query)
  } else if (call._tag === 'Call') {
    return callSql(call, target, {}, query)
  }
  throw new QueryCompileError(`${query}: only a call of an operator compiles alone`)
}

/**
 * The body's ordering for one input, as this package's order terms: a chosen
 * order resolved to the field or call the input names, a call compiled to its
 * SQL under its collation. An input naming no order it offers is the
 * request's mistake, refused as a compile error.
 */
export const compileOrderBy = (
  body: AnyQuery,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): ReadonlyArray<OrderTerm> => {
  let terms: ReadonlyArray<ExprOrderTerm>
  try {
    terms = Query.orderFor(body, input)
  } catch (error) {
    throw new QueryCompileError(`query "${query}": ${(error as Error).message}`)
  }
  return terms.map(term => {
    const { direction, nulls } = term
    // The term made sure a call orders: a number, or text under binary or asciiFold.
    if (term.expr._tag === 'Call') {
      const call = Expr.expanded(term.expr)
      const compiled = sql`${operand(call, target, input, query)}`
      return { key: collateFor(term.collation, dialectOf(target))(compiled), direction, nulls }
    }
    if (term.expr._tag !== 'Field') {
      throw new QueryCompileError(
        `query "${query}" orders by something that is neither a field nor a call`,
      )
    }
    const column = columnFor(target, term.expr.key, query)
    localeOnSqlite(column, term.expr.key, term.collation, query)
    return { key: column, direction, nulls, collation: Option.getOrUndefined(term.collation) }
  })
}

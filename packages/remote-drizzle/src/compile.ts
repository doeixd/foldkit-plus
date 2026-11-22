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
 *
 * Operations are lowered by metakit (`lowering.ts`); what stays here is the
 * shape of a query: which fields and relations a body may reach, what is
 * checked when a source is registered, and the order terms.
 */
import { sql, type AnyColumn, type SQL } from 'drizzle-orm'
import { Match, Option } from 'effect'
import {
  Computation,
  Expr,
  Order,
  Query,
  dependenciesOf,
  lowerAsciiName,
  type AnyEntity,
  type Collation,
  type EntityIdentity,
  type Reach,
} from 'foldkit-entity'
import type {
  AnyExpr,
  AnyQuery,
  EntityEnv,
  OrderTerm as ExprOrderTerm,
  Operation,
  Predicate,
  Ordering,
} from 'foldkit-entity'
import { Node, Str } from 'metakit'
import { wrap } from 'metakit/build'
import type { OrderTerm } from './cursor.js'
import { isKernelOperator } from './kernel.js'
import { isPostgresColumn } from './dialect.js'
import { callOperator, readingOf, type Reading } from 'foldkit-entity/lowering'
import { bindNode, decided, envFor, readingFor } from './lowering.js'
import { ownFieldKey } from './nodes.js'
import { frameOf, toSql } from './render.js'
import {
  QueryCompileError,
  columnFor,
  linkOf,
  operatorsOf,
  reachedTable,
  type CompileTarget,
} from './target.js'

export { QueryCompileError, type CompileTarget, type StoredRelation } from './target.js'

/** A truth as SQL: unknown is SQL's null, which `and`, `or` and `not` keep as SQL does. */
const constant = (value: unknown, query: string): SQL => {
  if (value === null) return sql`null`
  if (typeof value === 'boolean') return value ? sql`true` : sql`false`
  throw new QueryCompileError(
    `query "${query}": a predicate decided to ${String(value)}, not a truth`,
  )
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
  entity: AnyEntity | undefined,
): SQL => {
  const reading = readingFor(node)
  const residual = decided(node.node, reading, target, input, query)
  return Node.$is('Lit')(residual)
    ? constant(residual.value, query)
    : toSql(residual, frameOf(reading, target, entity, query))
}

/** Whether `expr` is a call that calls an operator: what `compileCall` selects. */
const callsAnOperator = (expr: AnyExpr): boolean =>
  Node.$is('Call')(expr.node) && dependenciesOf(expr).operators.length > 0

/**
 * Whether an order term's `expr`, no field, is an operator's call: one that
 * gives a value, since `Order` refuses a call giving a truth, so a truth here
 * is a predicate, which orders nowhere.
 */
const ordersByCall = (expr: AnyExpr): boolean =>
  callsAnOperator(expr) && Node.$is('Call')(expr.node) && expr.node.op.returns !== 'boolean'

/**
 * A computed assignment, as data, as a node: a field its column, a value
 * itself, a call by the operator the binding's tables name (text a collation
 * compares arrives folded, as a call of `lowerAsciiName`).
 */
const computedNode = (computation: Computation, target: CompileTarget, query: string): Node.Node =>
  Computation.$match(computation, {
    Field: ({ key }) => Node.Path({ segments: ['row', key], ast: Option.none() }),
    Value: ({ value }) => Node.Lit({ value }),
    Call: ({ operator, args }) => {
      if (operator === lowerAsciiName) {
        return Node.Call({
          op: Str.lowerAsciiOp,
          args: args.map(arg => computedNode(arg, target, query)),
        })
      }
      const tables = operatorsOf(target)
      const descriptor = Option.getOrThrowWith(
        Option.orElse(tables.sql.named(operator), () => tables.memory.named(operator)),
        () =>
          new QueryCompileError(
            `${query} computes by the operator "${operator}", which this binding's SQL operators do not run`,
          ),
      )
      return callOperator(
        descriptor,
        args.map(arg => computedNode(arg, target, query)),
        Option.none(),
      )
    },
  })

/**
 * A computed assignment, as data, as the SQL that writes it: a field its
 * column, a value a parameter, a call by the binding's SQL operators. What
 * `writer` sets, in the statement that writes.
 */
export const computationSql = (
  computation: Computation,
  target: CompileTarget,
  query: string,
): SQL => {
  const node = computedNode(computation, target, query)
  // The foreign operations it calls, which its frame renders by the binding's SQL.
  const reading = readingOf([wrap<EntityEnv, unknown>(node)])
  return toSql(node, frameOf(reading, target, undefined, query, true, query))
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
 * What a query body, and a guard's Read rule, may use besides: paths and
 * exists, which read other tables. A rule judged elsewhere (an invariant, a
 * `when`) does not reach another table yet, and is refused one by `supported`.
 */
export const bodyOperations: ReadonlyArray<Operation> = [...supported, 'path', 'exists']

/**
 * Every Entity a body's paths and exists reach, once each: the tables whose
 * `visible` a request resolves for its reader before compiling (`visibleOf`).
 */
export const reachedEntities = (body: AnyQuery): ReadonlyArray<EntityIdentity<string>> => {
  const owners = new Map<symbol, EntityIdentity<string>>()
  for (const reached of Query.dependencies(body).reaches) {
    const through = reached.via.map(relation => relation.target().identity)
    const met = Match.valueTags(reached, {
      ViewerPath: ({ viewer }) => [viewer.identity, ...through],
      Path: () => through,
      Exists: ({ relation }) => [...through, relation.owner],
    })
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
const checkReach = (reached: Reach, target: CompileTarget, query: string): void => {
  // A path from the viewer reads no column of the judged row, so its table may meet it.
  const met: Array<CompileTarget['table']> = Match.valueTags(reached, {
    ViewerPath: () => [],
    Path: () => [target.table],
    Exists: () => [target.table],
  })
  const meet = (table: CompileTarget, owner: EntityIdentity<string>): void => {
    if (met.includes(table.table)) {
      throw new QueryCompileError(
        `query "${query}" reaches ${owner.name}'s table twice in ${Expr.show(reached.expr)}, which this compiler cannot alias yet`,
      )
    }
    met.push(table.table)
  }
  let at = target
  if (reached._tag === 'ViewerPath') {
    at = reachedTable(target, reached.viewer.identity, query)
    meet(at, reached.viewer.identity)
  }
  for (const relation of reached.via) {
    const owner = relation.target().identity
    const next = reachedTable(at, owner, query)
    linkOf(at, relation, query)
    at = next
    meet(at, owner)
  }
  if (reached._tag !== 'Exists') {
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
      // Each alternative's collation as the term it resolves to would carry it.
      Chosen: ({ choices }) =>
        Object.values(choices).map(expr => ({ expr, collation: Order.asc(expr).collation })),
    }),
  )
  for (const { expr, collation } of ordered) {
    Option.map(ownFieldKey(expr.node), key =>
      localeOnSqlite(columnFor(target, key, query), key, collation, query),
    )
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
      if (each._tag === 'Locale' && !isPostgresColumn(column)) {
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
  const inSql = Expr.unsupported(nodes, {
    operations,
    operators: {
      has: operator => isKernelOperator(operator) || tables.sql.has(operator),
      versions: tables.sql.versions,
    },
  })
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
): ReadonlyArray<SQL> => compilePredicates(body.where, target, input, query, body.entity)

/**
 * Predicates with no body around them, as SQL fragments: an invariant's, say.
 * `entity` is the Entity the row is, where a predicate goes through a relation.
 */
export const compilePredicates = (
  predicates: ReadonlyArray<Predicate>,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
  entity?: AnyEntity,
): ReadonlyArray<SQL> => predicates.map(node => predicate(node, target, input, query, entity))

/**
 * One call of a primitive operator as SQL, by the binding's table, its
 * arguments compiled and cast as in a body: what a conformance check selects
 * to ask the database one question (`select <call>`). Never decided in memory,
 * though its arguments read no row; anything that is not a call is refused.
 */
export const compileCall = (call: AnyExpr, target: CompileTarget, query: string): SQL => {
  if (!callsAnOperator(call)) {
    throw new QueryCompileError(`${query}: only a call of an operator compiles alone`)
  }
  const reading = readingFor(call)
  const node = bindNode(call.node, envFor(call.node, reading, target, {}))
  return toSql(node, frameOf(reading, target, undefined, query, true))
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
    return Option.match(ownFieldKey(term.expr.node), {
      onSome: key => {
        const column = columnFor(target, key, query)
        localeOnSqlite(column, key, term.collation, query)
        return { key: column, direction, nulls, collation: Option.getOrUndefined(term.collation) }
      },
      onNone: () => {
        if (!ordersByCall(term.expr)) {
          throw new QueryCompileError(
            `query "${query}" orders by something that is neither a field nor a call`,
          )
        }
        // The term made sure a call orders: a number, or text under binary or asciiFold.
        const reading = keyReading(term, query)
        // The key is the call folded under the term's collation; the node alone would order unfolded.
        const key = reading.keys[0]!
        const bound = bindNode(key, envFor(key, reading, target, input))
        return { key: toSql(bound, frameOf(reading, target, body.entity, query)), direction, nulls }
      },
    })
  })
}

/** An order term's key, folded under its collation, with its reading; a locale is the backend's, so it cannot be one. */
const keyReadings = new WeakMap<ExprOrderTerm, Reading>()

const keyReading = (term: ExprOrderTerm, query: string): Reading => {
  const known = keyReadings.get(term)
  if (known !== undefined) return known
  try {
    const made = readingOf([term.expr], [term])
    keyReadings.set(term, made)
    return made
  } catch (error) {
    throw new QueryCompileError(`query "${query}": ${(error as Error).message}`)
  }
}

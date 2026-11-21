/**
 * What a binding offers to be compiled against, and how a compiled body moves
 * between tables: a column per field, the rows a relation reaches, and what
 * its reader may see of them.
 */
import { eq, sql, type AnyColumn, type SQL, type Table } from 'drizzle-orm'
import { Option } from 'effect'
import type { EntityIdentity, ExprContext, OneRelation } from 'foldkit-entity'
import type { RelationBinding } from './binding.js'
import { isPostgresTable } from './dialect.js'
import { kernelOperators, type BindingOperators } from './operators.js'

export class QueryCompileError extends Error {
  constructor(message: string) {
    super(`[foldkit-remote-drizzle] ${message}`)
    this.name = 'QueryCompileError'
  }
}

/** How a relation is stored, as far as compiling reads it: a `one` by the column it is stored on. */
export type StoredRelation =
  | { readonly kind: 'one'; readonly field: AnyColumn }
  | { readonly kind: Exclude<RelationBinding['kind'], 'one'> }

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
  readonly relations?: Readonly<Record<string, StoredRelation>> | undefined
  /** The binding of each Entity a path or an exists may reach, by identity; `bind` sets it. */
  readonly reach?: ((owner: EntityIdentity<string>) => Option.Option<CompileTarget>) | undefined
  /**
   * The rows this request's reader may see of each table reached: its
   * `visible`, resolved for the principal. A body that reaches another table
   * is refused without it, rather than read rows its reader may not see.
   */
  readonly visibleOf?: ((owner: EntityIdentity<string>) => Option.Option<SQL>) | undefined
}

export const operatorsOf = (target: CompileTarget): BindingOperators =>
  target.operators ?? kernelOperators

export const dialectOf = (target: CompileTarget): 'sqlite' | 'postgres' =>
  isPostgresTable(target.table) ? 'postgres' : 'sqlite'

/**
 * A value as the database binds it. SQLite binds no boolean and stores one as 1
 * or 0, which a boolean column's own encoder writes too; so a value compared
 * with what no column encodes (a computed value, a call) is 1 or 0 already.
 */
export const bindable = (value: unknown, target: CompileTarget): unknown =>
  typeof value === 'boolean' && dialectOf(target) === 'sqlite' ? Number(value) : value

/** The binding a path or an exists reaches, refused by name where none is bound. */
export const reachedTable = (
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
export const linkOf = (table: CompileTarget, relation: OneRelation, query: string): AnyColumn => {
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
export const visibleIn = (target: CompileTarget, owner: EntityIdentity<string>, query: string) =>
  Option.getOrThrowWith(
    Option.fromUndefinedOr(target.visibleOf),
    () =>
      new QueryCompileError(
        `query "${query}" reaches ${owner.name}, but was compiled without what its reader may see of it`,
      ),
  )(owner)

/** A reached binding, compiled for the request its query was: the same reader and context. */
export const onward = (from: CompileTarget, next: CompileTarget): CompileTarget => ({
  ...next,
  visibleOf: from.visibleOf,
  context: from.context,
})

/**
 * The column a field is stored in, or a `one` relation read as an operand
 * (the id it points at): the column it is stored on, in this table.
 */
export const columnFor = (target: CompileTarget, key: string, query: string): AnyColumn => {
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

/** The rows of `next` the reader may see, with `at`: the condition that selects the row a link reaches. */
const visibleRows = (
  from: CompileTarget,
  owner: EntityIdentity<string>,
  at: SQL,
  query: string,
): SQL =>
  Option.match(visibleIn(from, owner, query), {
    onNone: () => at,
    onSome: rule => sql`${at} and (${rule})`,
  })

/**
 * What `read` makes of the row `via` reaches from `from`: a scalar subquery
 * per relation, each under its table's visibility, so a null link or a row
 * the reader may not see reads null, as `Judge` reads a path that reaches no
 * row. Each subquery reads only the row around it, so no alias is needed
 * while no table repeats along the way (`checkFields` refuses one that does).
 */
export const atRow = (
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
  const where = visibleRows(from, owner, eq(columnFor(next, 'id', query), link), query)
  return sql`(select ${atRow(onward(from, next), rest, read, query)} from ${next.table} where ${where})`
}

/**
 * A path from the viewer: the subqueries a path is, started at the viewer's
 * row (by its id, bound) instead of the judged one, under the viewer's
 * table's visibility too. A visitor, or a viewer of another Entity, binds a
 * null id, which no row has, so the path reads null, as `Judge` reads it.
 */
export const viewerAt = (
  target: CompileTarget,
  owner: EntityIdentity<string>,
  id: string | null,
  via: ReadonlyArray<OneRelation>,
  read: (at: CompileTarget) => SQL,
  query: string,
): SQL => {
  const start = reachedTable(target, owner, query)
  const where = visibleRows(target, owner, eq(columnFor(start, 'id', query), id), query)
  const inside = atRow(onward(target, start), via, read, query)
  return sql`(select ${inside} from ${start.table} where ${where})`
}

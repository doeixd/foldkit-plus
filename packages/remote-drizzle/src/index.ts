/**
 * `foldkit-remote-drizzle` — **provisional** compiler from Remote
 * `Entity`/`Selection`/`Query` to Drizzle's typed query graph.
 *
 * It captures no connection and re-plans nothing: `Remote.plan` already produces
 * entity + id + field batches, so this maps a Selection's fields to Drizzle
 * columns. Each entity is declared once with `entity(name, table)`, which is
 * both the Drizzle binding and the Remote `EntityDescriptor`.
 *
 * Keyset pagination and required-column projection are adapted from fate's
 * Drizzle integration (MIT); see `THIRD_PARTY_NOTICES.md`.
 */
import {
  and,
  eq,
  getTableColumns,
  or,
  getTableName,
  gte,
  inArray,
  entityKind,
  is,
  lt,
  lte,
  sql,
  type AnyColumn,
  type SQL,
  type Table,
} from 'drizzle-orm'
import { getTableConfig as getPgTableConfig, type PgTable } from 'drizzle-orm/pg-core'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { Array as Arr, Clock, Effect, Match, Option, Result, Schema } from 'effect'
import {
  Entity as DomainEntity,
  Expr,
  Query,
  Write,
  dependenciesOf,
  evaluate,
  isPredicate,
  viewerIdOf,
  type AnyQuery,
  type Computation,
  type EntityIdentity,
  type EntityRef,
  type Change,
  type Evidence,
  type Invariant,
  type WriteAssignment,
} from 'foldkit-entity'
import type { ConnectionSpec, NormalizedPatch, QueryDescriptor } from 'foldkit-remote'
import { Diagnostics, Entity } from 'foldkit-remote'
import {
  RemoteServer,
  RemoteServerError,
  RowRequirement,
  exprContext,
  type EntityRecord,
  type EntityWriter,
  type LiveHub,
  type EntitySource,
  type EntitySourceContext,
  type QuerySource,
  type WriteRequirement,
  type WriteWhen,
} from 'foldkit-remote-server'
import type { AnyEntityBinding, ManyRelation, ManyToManyRelation } from './binding.js'
import { checkConstraints } from './checks.js'
import { serverOnlyRules, statementFailed } from './diagnostics.js'
import { idColumn, projectsAny, contextOverwrites } from './columns.js'
import {
  checkFields,
  compileOrderBy,
  compilePredicates,
  compileWhere,
  computationSql,
  operatorProblems,
  QueryCompileError,
  reachedEntities,
  requireOperators,
  supported,
} from './compile.js'
import {
  cursorSelection,
  idCursor,
  keyCursor,
  keysOf,
  keysetWhere,
  orderByTerms,
  readCursor,
  CursorRead,
  type OrderTerm,
} from './cursor.js'
import {
  DrizzleDatabase,
  drizzleWrites,
  type DrizzleDatabaseService,
  type DrizzleWrites,
} from './database.js'
import { toQueryPage } from './page.js'
import { quoted } from './quoted.js'
import { buildPage } from './pagination.js'
import { shapeWindow } from './window.js'

export * from './bind.js'
export { checkConstraints, entityChecks, type EntityCheckOptions } from './checks.js'
export type { RemoteDrizzleDiagnostic, ServerOnlyRules, StatementFailed } from './diagnostics.js'
export * from './compile.js'
export * from './binding.js'
export * from './columns.js'
export * from './cursor.js'
export * from './operators.js'
export * from './database.js'
export * from './page.js'
export * from './pagination.js'
export * from './window.js'
export * from './poll.js'

/**
 * An own-property lookup. Request field names are client-supplied and relation
 * names are developer-supplied, so an inherited member like `toString` must not
 * satisfy the lookup.
 */
/** The binding's visibility rule for a principal, whichever form it answers in. */
const visibleFor = (
  binding: AnyEntityBinding,
  principal: unknown,
): Effect.Effect<SQL | undefined, RemoteServerError> => {
  if (binding.visible === undefined) return Effect.succeed(undefined)
  const visible = binding.visible(principal, binding)
  return Effect.isEffect(visible) ? visible : Effect.succeed(visible)
}

/**
 * What `principal` may see of each table a body's paths and exists reach,
 * resolved once per request, so the compiled subqueries read only those rows.
 * An Entity the body did not name here is a compiler's mistake, refused.
 */
const reachedVisibility = (
  binding: AnyEntityBinding,
  body: AnyQuery,
  principal: unknown,
): Effect.Effect<(owner: EntityIdentity<string>) => Option.Option<SQL>, RemoteServerError> =>
  Effect.gen(function* () {
    const seen = new Map<symbol, Option.Option<SQL>>()
    for (const owner of reachedEntities(body)) {
      // An Entity not bound beside this one has no rule to read: compiling refuses it.
      const reached = Option.flatMap(Option.fromUndefinedOr(binding.reach), reach => reach(owner))
      if (Option.isSome(reached)) {
        seen.set(owner.token, Option.fromUndefinedOr(yield* visibleFor(reached.value, principal)))
      }
    }
    return owner =>
      Option.getOrThrowWith(
        Option.fromUndefinedOr(seen.get(owner.token)),
        () => new QueryCompileError(`${owner.name}'s visibility was not resolved for this request`),
      )
  })

const pick = <T>(record: Readonly<Record<string, T>> | undefined, key: string): T | undefined =>
  record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined

/**
 * Where a collection relation's children are read from: the table holding the
 * parent key (the target itself for `many`, the join table for `manyToMany`),
 * the join to the target when there is one, and the parent-side column the
 * children are grouped under.
 */
const childSide = (
  binding: AnyEntityBinding,
  relation: ManyRelation<AnyEntityBinding> | ManyToManyRelation<AnyEntityBinding>,
): {
  readonly table: Table
  readonly parent: AnyColumn
  readonly child: AnyColumn
  /** The child's id as `table` holds it: `child` itself, or a through table's column. */
  readonly held: AnyColumn
  readonly join: { readonly table: Table; readonly on: SQL } | undefined
  readonly parentKey: AnyColumn
} => {
  const child = idColumn(relation.entity)
  return relation.kind === 'many'
    ? {
        table: relation.entity.table,
        parent: relation.foreignKey,
        child,
        held: child,
        join: undefined,
        parentKey: relation.localKey,
      }
    : {
        table: relation.through,
        parent: relation.localColumn,
        child,
        held: relation.foreignColumn,
        join: { table: relation.entity.table, on: eq(relation.foreignColumn, child) },
        parentKey: idColumn(binding),
      }
}

/** A whole id batch as one `IN (...)` — the normalized-store advantage. */
export const whereIds = (binding: AnyEntityBinding, ids: ReadonlyArray<string>): SQL =>
  inArray(idColumn(binding), ids)

export interface SourceQuery {
  readonly columns: Record<string, AnyColumn>
  readonly where: SQL
}

/**
 * The column map for the requested scalar and relation fields. The primary key
 * is always selected: normalization needs it even when the client did not ask
 * for an `id` field. A relation field selects its foreign key under the
 * relation's own name, which `reader` rewrites to a ref.
 */
export const selectColumns = (
  binding: AnyEntityBinding,
  fields: readonly string[],
): Record<string, AnyColumn> => {
  const columns: Record<string, AnyColumn> = { id: idColumn(binding) }
  for (const field of fields) {
    const column = binding.columns[field]
    if (column !== undefined) {
      columns[field] = column
      continue
    }
    const relation = binding.relations[field]
    if (relation !== undefined) {
      columns[field] =
        relation.kind === 'one'
          ? relation.field
          : relation.kind === 'many'
            ? relation.localKey
            : idColumn(binding)
    }
  }
  return columns
}

/** Replaces each selected relation's foreign key with the ref wire key it encodes. */
const relationRefs = (
  binding: AnyEntityBinding,
  fields: readonly string[],
  row: Record<string, unknown>,
): Record<string, unknown> => {
  const values = { ...row }
  for (const field of fields) {
    const relation = binding.relations[field]
    if (relation === undefined) continue
    if (relation.kind !== 'one') {
      // The injected-executor path cannot load children. Leave the raw key: the
      // client's array schema rejects it instead of reporting a false absence,
      // which would refetch forever. Use `source` for relations.
      continue
    }
    const id = row[field]
    values[field] =
      id === null || id === undefined
        ? null
        : Entity.refKey({ entity: relation.entity.name, id: String(id) })
  }
  return values
}

/**
 * Maps rows a mutation returned (e.g. Drizzle `returning`) to entity patches,
 * rewriting a `one` relation's foreign key to its ref key. `fields` is the set
 * of columns the query selected (see `selectColumns`). A collection relation is
 * left as its raw key; load it with `source`.
 */
export const normalize = (
  binding: AnyEntityBinding,
  rows: ReadonlyArray<Record<string, unknown>>,
  fields: readonly string[],
): ReadonlyArray<NormalizedPatch> =>
  rows.map(row => ({
    entity: binding.name,
    id: String(row.id),
    values: relationRefs(binding, fields, row),
  }))

/**
 * The `returning` columns for `fields` and the normalization of the rows they
 * yield, paired so a mutation cannot select one set of columns and normalize
 * another.
 */
export const returning = Object.assign(
  (
    binding: AnyEntityBinding,
    fields: readonly string[],
  ): {
    readonly columns: Record<string, AnyColumn>
    readonly patches: (
      rows: ReadonlyArray<Record<string, unknown>>,
    ) => ReadonlyArray<NormalizedPatch>
  } => ({
    columns: selectColumns(binding, fields),
    patches: rows => normalize(binding, rows, fields),
  }),
  {
    /**
     * Every column of row `id` as it now is, with each `one` relation as its ref,
     * as patches: what a mutation handler returns in `entities` so the client's
     * store learns all it wrote, not only the fields it patched. Empty when there
     * is no such row. A collection relation is not read; load it with `source`.
     */
    row: (
      binding: AnyEntityBinding,
      id: string,
    ): Effect.Effect<ReadonlyArray<NormalizedPatch>, RemoteServerError, DrizzleDatabase> =>
      Effect.gen(function* () {
        // Every column, and each `one` relation as the ref its foreign key encodes.
        const fields = [
          ...Object.keys(binding.columns),
          ...Object.entries(binding.relations).flatMap(([field, relation]) =>
            relation.kind === 'one' ? [field] : [],
          ),
        ]
        const columns = selectColumns(binding, fields)
        const database = yield* DrizzleDatabase
        const rows = yield* runStatement(
          () =>
            database
              .select(columns)
              .from(binding.table)
              .where(whereIds(binding, [id])),
          'Database query failed',
        )
        return normalize(binding, rows, fields)
      }),
  },
)

/**
 * A pruned reader backed by an injected executor. Use it when the database is
 * not an Effect service, or to test the projection without one.
 *
 * Field authorization still holds: only `context.fields` (already intersected
 * with the principal's allowed fields by `RemoteServer`) become columns.
 */
export const reader =
  <E, R = never, P = unknown>(
    binding: AnyEntityBinding,
    run: (query: SourceQuery) => Effect.Effect<ReadonlyArray<Record<string, unknown>>, E, R>,
  ) =>
  (context: EntitySourceContext<P>): Effect.Effect<ReadonlyArray<EntityRecord>, E, R> =>
    Effect.gen(function* () {
      if (context.ids.length === 0) return []
      if (!projectsAny(binding, context.fields)) return []
      const columns = selectColumns(binding, context.fields)
      const rows = yield* run({ columns, where: whereIds(binding, context.ids) })
      return rows.map(row => ({
        id: String(row.id),
        values: relationRefs(binding, context.fields, row),
      }))
    })

const selectRows = (
  database: DrizzleDatabaseService,
  table: Table,
  columns: Record<string, AnyColumn | SQL>,
  options: {
    readonly where?: SQL | undefined
    readonly innerJoin?: { readonly table: Table; readonly on: SQL } | undefined
    readonly groupBy?: readonly AnyColumn[] | undefined
    readonly orderBy?: readonly SQL[] | undefined
    readonly limit?: number | undefined
  } = {},
): Effect.Effect<ReadonlyArray<Record<string, unknown>>, RemoteServerError> => {
  let statement = database.select(columns).from(table)
  if (options.where !== undefined) statement = statement.where(options.where)
  if (options.innerJoin !== undefined) {
    statement = statement.innerJoin(options.innerJoin.table, options.innerJoin.on)
  }
  if (options.groupBy !== undefined) statement = statement.groupBy(...options.groupBy)
  if (options.orderBy !== undefined) statement = statement.orderBy(...options.orderBy)
  if (options.limit !== undefined) statement = statement.limit(options.limit)
  return runStatement(() => statement, 'Database query failed')
}

/**
 * A statement, failing as a `RemoteServerError` that says only `failed`. The
 * driver's error carries the SQL and its parameters: it is reported for
 * operators (`StatementFailed`) and never sent, where a defect would reach the
 * client over RPC. Run every statement a handler makes through it.
 *
 * ```ts
 * yield* runStatement(() => db.update(posts).set({ title }).where(eq(posts.id, id)), 'Database write failed')
 * ```
 */
export const runStatement = <A>(
  statement: () => PromiseLike<A>,
  failed: string,
): Effect.Effect<A, RemoteServerError> =>
  Effect.tryPromise({ try: () => Promise.resolve(statement()), catch: error => error }).pipe(
    Effect.tapError(error => Diagnostics.report(statementFailed(failed, error))),
    Effect.mapError(() => new RemoteServerError({ message: failed })),
  )

/** What `compile` builds, or the body it could not compile, refused as the server's error. */
const compileFor = <A>(compile: () => A): Effect.Effect<A, RemoteServerError> =>
  Effect.suspend(() => {
    try {
      return Effect.succeed(compile())
    } catch (error) {
      if (error instanceof QueryCompileError)
        return Effect.fail(new RemoteServerError({ message: error.message }))
      throw error
    }
  })

const withFilters = (base: SQL, ...filters: ReadonlyArray<SQL | undefined>): SQL => {
  const conditions: SQL[] = [base]
  for (const filter of filters) if (filter !== undefined) conditions.push(filter)
  return conditions.length === 1 ? base : and(...conditions)!
}

/** A relation cursor is the last ref's key (`"Entity:id"`); the row key is the id. */
const cursorId = (cursor: string): string => {
  const parts = Entity.refParts(cursor)
  return parts.id === '' ? cursor : parts.id
}

/**
 * A `RemoteServer.entity` source backed by the `DrizzleDatabase` service. It
 * selects the requested columns in one batch, then resolves each selected
 * relation: a `one` relation becomes a ref key, and a `many` relation loads the
 * target ids in one statement, at most `options.maxCollection` (100) a row
 * unless the read asks a window: a row holding more is refused, as a whole
 * list cannot say it was cut short. `options.policies` adds a principal-scoped filter
 * to a collection relation (e.g. only rows this principal may see), and
 * `options.filter` decides what a principal sees of each record, as
 * `RemoteServer.entity`'s does.
 *
 * A `Derived.exists` of the binding is answered for whoever reads, as the
 * server it is mounted in says (`RemoteServer.make`'s `viewer`), which is
 * refused without one; a read made outside a server is refused it.
 */
export const source = <P = unknown>(
  binding: AnyEntityBinding,
  options?: {
    readonly authorize?: EntitySource<P, DrizzleDatabase>['authorize'] | undefined
    readonly filter?: EntitySource<P, DrizzleDatabase>['filter'] | undefined
    /** The fields every principal reads alike, of every row: see `EntitySource.shared`. */
    readonly shared?: ReadonlyArray<string> | undefined
    readonly policies?:
      | Readonly<Record<string, ((principal: P) => SQL | undefined) | undefined>>
      | undefined
    /**
     * The most rows a collection relation read whole (with no window) may
     * hold for one row; a read finding more is refused. Default 100.
     */
    readonly maxCollection?: number | undefined
  },
): EntitySource<P, DrizzleDatabase> => {
  const maxCollection = options?.maxCollection ?? 100
  if (!Number.isInteger(maxCollection) || maxCollection < 1) {
    throw new Error(
      `[foldkit-remote-drizzle] ${binding.name}'s maxCollection must be a whole number above 0`,
    )
  }
  for (const field of Object.keys(options?.policies ?? {})) {
    const relation = binding.relations[field]
    if (relation === undefined || relation.kind === 'one') {
      throw new Error(
        `[foldkit-remote-drizzle] policy "${field}" on entity "${binding.name}" needs a collection relation`,
      )
    }
  }
  const unserved = (options?.shared ?? []).filter(field => !Object.hasOwn(binding.fields, field))
  if (unserved.length > 0) {
    throw new Error(
      `[foldkit-remote-drizzle] ${binding.name}'s shared fields name no member: ${unserved.join(', ')}`,
    )
  }
  const perViewer = Object.keys(binding.computed).filter(
    field => binding.computed[field]!.viewer !== undefined,
  )
  // A shared field's written value goes to every subscriber as it is, and this one is each reader's own.
  const sharedPerViewer = perViewer.filter(field => options?.shared?.includes(field) === true)
  if (sharedPerViewer.length > 0) {
    throw new Error(
      `[foldkit-remote-drizzle] ${binding.name}'s ${sharedPerViewer.join(', ')} depend on who reads them, so none is shared`,
    )
  }
  return {
    entity: binding.name,
    fields: new Set(Object.keys(binding.fields)),
    ...(options?.shared === undefined ? {} : { shared: new Set(options.shared) }),
    ...(perViewer.length === 0 ? {} : { perViewer }),
    read: context =>
      Effect.gen(function* () {
        const unmounted = perViewer.filter(field => context.fields.includes(field))
        if (context.viewer === undefined && unmounted.length > 0) {
          return yield* new RemoteServerError({
            message: `${binding.name}'s ${unmounted.join(', ')} depend on who reads them, and this read was given no viewer: read it through the server it is mounted in`,
          })
        }
        if (context.ids.length === 0) return []
        if (!projectsAny(binding, context.fields)) return []
        const database = yield* DrizzleDatabase
        const columns = selectColumns(binding, context.fields)
        for (const field of context.fields) {
          const computed = binding.computed[field]
          if (computed === undefined) continue
          const relation = computed.over ?? binding.relations[computed.relation]
          if (relation === undefined || relation.kind === 'one') continue
          const { parentKey } = childSide(binding, relation)
          columns[parentKey.name] = parentKey
        }
        // A row the principal may not see is not read, so it is not there to them.
        const rows = yield* selectRows(database, binding.table, columns, {
          where: withFilters(
            whereIds(binding, context.ids),
            yield* visibleFor(binding, context.principal),
          ),
        })

        for (const field of context.fields) {
          const relation = binding.relations[field]
          if (relation === undefined) continue

          // The relation's own policy, and the rows of its target this principal may see.
          const targetVisible = yield* visibleFor(relation.entity, context.principal)
          const relationPolicy = pick(options?.policies, field)?.(context.principal)
          const policyWhere =
            relationPolicy === undefined || targetVisible === undefined
              ? (relationPolicy ?? targetVisible)
              : and(relationPolicy, targetVisible)
          const window = pick(context.windows, field)
          if (relation.kind === 'one') {
            if (window !== undefined) {
              return yield* new RemoteServerError({
                message: `Relation "${field}" is singular and cannot be windowed`,
              })
            }
            // A ref to a row this principal may not see would say the row exists, and
            // which one. One read finds the targets they may see; the rest read as none.
            const held = [
              ...new Set(rows.map(row => row[field]).filter(id => id !== null && id !== undefined)),
            ]
            const seen =
              targetVisible === undefined || held.length === 0
                ? undefined
                : new Set(
                    (yield* selectRows(
                      database,
                      relation.entity.table,
                      { id: idColumn(relation.entity) },
                      { where: and(inArray(idColumn(relation.entity), held), targetVisible) },
                    )).map(target => String(target.id)),
                  )
            for (const row of rows) {
              const id = row[field]
              row[field] =
                id === null || id === undefined || seen?.has(String(id)) === false
                  ? null
                  : Entity.refKey({ entity: relation.entity.name, id: String(id) })
            }
            continue
          }

          if (relation.kind === 'many' && relation.single === true && window !== undefined) {
            return yield* new RemoteServerError({
              message: `Relation "${field}" is singular and cannot be windowed`,
            })
          }
          const side = childSide(binding, relation)
          const targetId = side.child
          // The target id is the final tie-breaker, so ranking and ordering
          // agree and a page never drops a row that ties on the order columns.
          const declared = relation.orderBy ?? []
          const order: ReadonlyArray<OrderTerm> = declared.some(term => term.key === targetId)
            ? declared
            : [...declared, { key: targetId, direction: 'asc' }]
          // The same order with the child's id read off the table holding the
          // parent column, which a join leaves equal: SQLite cannot read an order
          // of the target's id from an index of a through table, and sorts every
          // child of the parent to find the first.
          const heldOrder = order.map(term =>
            term.key === targetId ? { ...term, key: side.held } : term,
          )
          const naturalOrder = orderByTerms(heldOrder, 'forward')
          const parentKeys = [
            ...new Set(
              rows.map(row => row[field]).filter(key => key !== null && key !== undefined),
            ),
          ]
          // One statement for every parent, keeping the first `keep` children of
          // each in `order`: the statement count does not grow with the parents,
          // nor its rows with their children. Each parent's children are asked
          // with their own `limit`, through a correlated `in` (SQLite has no
          // lateral join, and Postgres bounds this form too) rather than all ranked and the rest
          // dropped, so with an index on the parent column and `order` the
          // database stops after `keep` of them however many the parent holds.
          const firstOf = (
            parents: ReadonlyArray<unknown>,
            filters: ReadonlyArray<SQL | undefined>,
            order: ReadonlyArray<SQL>,
            keep: number,
          ) => {
            const joined =
              side.join === undefined
                ? sql`${side.table}`
                : sql`${side.table} inner join ${side.join.table} on ${side.join.on}`
            const each = sql`(select ${side.parentKey} as p from ${binding.table} where ${inArray(side.parentKey, [...parents])}) as foldkit_parents`
            const own = withFilters(sql`${side.parent} = foldkit_parents.p`, ...filters)
            const first = sql`select ${targetId} from ${joined} where ${own} order by ${sql.join([...order], sql`, `)} limit ${keep}`
            const kept = sql`(select foldkit_parents.p, ${targetId} from ${each}, ${joined} where ${side.parent} = foldkit_parents.p and ${targetId} in (${first}))`
            return selectRows(
              database,
              side.table,
              { child: targetId, parent: side.parent },
              {
                where: sql`(${side.parent}, ${targetId}) in ${kept}`,
                innerJoin: side.join,
                orderBy: order,
              },
            )
          }

          if (window !== undefined) {
            const shape = shapeWindow(window, { defaultSize: 20 })
            if (shape.cursor !== undefined && context.ids.length !== 1) {
              return yield* new RemoteServerError({
                message: `Relation "${field}" cursor needs a single parent`,
              })
            }
            const empty = { refs: [] as ReadonlyArray<string>, hasNext: false, hasPrevious: false }
            const traversalOrder = orderByTerms(heldOrder, shape.traversal)

            let keyset: SQL | undefined
            if (shape.cursor !== undefined) {
              // Only a row the page could show places it: one hidden by the target's Read rule
              // or the relation's policy answers as an unknown one does, so a cursor tells
              // neither that it exists nor where it sorts. A policy may read a through table.
              const cursorRows = yield* selectRows(database, side.table, cursorSelection(order), {
                where: and(eq(targetId, cursorId(shape.cursor)), policyWhere),
                innerJoin: side.join,
                limit: 1,
              })
              const cursorRow = cursorRows[0]
              if (cursorRow === undefined) {
                return yield* new RemoteServerError({
                  message: `Relation "${field}" cursor no longer resolves`,
                })
              }
              keyset = keysetWhere(heldOrder, keysOf(order, cursorRow), shape.traversal)
            }

            const byParent = new Map<string, Array<Record<string, unknown>>>()
            if (parentKeys.length > 0) {
              const childRows = yield* firstOf(
                parentKeys,
                [relation.where, policyWhere, keyset],
                traversalOrder,
                shape.pageSize + 1,
              )
              for (const child of childRows) {
                const rows_ = byParent.get(String(child.parent)) ?? []
                rows_.push(child)
                byParent.set(String(child.parent), rows_)
              }
            }

            for (const row of rows) {
              const key = row[field]
              if (key === null || key === undefined) {
                row[field] = empty
                continue
              }
              // An empty page under a cursor still has its cursor-side boundary.
              const childRows = byParent.get(String(key)) ?? []
              const natural = shape.traversal === 'backward' ? [...childRows].reverse() : childRows
              const page = buildPage({
                rows: natural,
                pageSize: shape.pageSize,
                traversal: shape.traversal,
                cursor: shape.cursor,
                cursorOf: child => String(child.child),
              })
              row[field] = {
                refs: page.rows.map(child =>
                  Entity.refKey({ entity: relation.entity.name, id: String(child.child) }),
                ),
                hasNext: page.hasNext,
                hasPrevious: page.hasPrevious,
              }
            }
            continue
          }

          // The inverse side of a one-to-one reads as the one ref, or none.
          const single = relation.kind === 'many' && relation.single === true
          const byParent = new Map<string, string[]>()
          if (parentKeys.length > 0) {
            // A list read whole has no `hasNext` to say it was cut short: one past
            // the bound is read, so a parent holding more is refused, not truncated.
            const childRows = yield* firstOf(
              parentKeys,
              [relation.where, policyWhere],
              naturalOrder,
              single ? 1 : maxCollection + 1,
            )
            for (const child of childRows) {
              const refs = byParent.get(String(child.parent)) ?? []
              refs.push(Entity.refKey({ entity: relation.entity.name, id: String(child.child) }))
              byParent.set(String(child.parent), refs)
            }
          }
          for (const row of rows) {
            const key = row[field]
            const refs = key === null || key === undefined ? [] : (byParent.get(String(key)) ?? [])
            if (refs.length > maxCollection) {
              return yield* new RemoteServerError({
                message: `${binding.name}.${field} holds more than ${maxCollection} rows for one ${binding.name}, more than a read of it whole may: read it with a window (Entity.page), or raise the source's maxCollection`,
              })
            }
            row[field] = single ? (refs[0] ?? null) : refs
          }
        }

        for (const field of context.fields) {
          const computed = binding.computed[field]
          if (computed === undefined) continue
          const relation = computed.over ?? binding.relations[computed.relation]
          if (relation === undefined || relation.kind === 'one') {
            return yield* new RemoteServerError({
              message: `Computed field "${field}" needs collection relation "${computed.relation}"`,
            })
          }
          const side = childSide(binding, relation)
          const parentKeys = [
            ...new Set(
              rows
                .map(row => row[side.parentKey.name])
                .filter(key => key !== null && key !== undefined),
            ),
          ]
          const countVisible = yield* visibleFor(relation.entity, context.principal)
          const countRelation = pick(options?.policies, computed.relation)?.(context.principal)
          // A count of rows the principal may not see would say how many there are.
          const countPolicy =
            countRelation === undefined || countVisible === undefined
              ? (countRelation ?? countVisible)
              : and(countRelation, countVisible)
          const keyOf = (row: Record<string, unknown>): Option.Option<string> =>
            Option.map(Option.fromNullishOr(row[side.parentKey.name]), String)
          const viewing = computed.viewer
          if (viewing !== undefined) {
            // A Derived.exists: the least id among the rows pointing here and at the reader.
            // `Expr.viewer` of the Entity the viewer relation points at; a read
            // given no viewer was refused above.
            const reader = Option.flatMap(Option.fromUndefinedOr(context.viewer), viewer =>
              viewerIdOf({ name: viewing.entity }, { viewer }),
            )
            const found = new Map<string, string>()
            if (parentKeys.length > 0 && Option.isSome(reader)) {
              const witness = sql<string>`min(${side.child})`
              const witnessRows = yield* selectRows(
                database,
                side.table,
                { witness, parent: side.parent },
                {
                  where: withFilters(
                    inArray(side.parent, parentKeys),
                    eq(viewing.column, reader.value),
                    countPolicy,
                  ),
                  innerJoin: side.join,
                  groupBy: [side.parent],
                },
              )
              for (const witnessRow of witnessRows)
                found.set(String(witnessRow.parent), String(witnessRow.witness))
            }
            for (const row of rows)
              row[field] = Option.getOrNull(
                Option.flatMap(keyOf(row), key => Option.fromUndefinedOr(found.get(key))),
              )
            continue
          }
          const counts = new Map<string, number>()
          if (parentKeys.length > 0) {
            const count = sql<number>`count(*)`.mapWith(Number)
            const countRows = yield* selectRows(
              database,
              side.table,
              { count, parent: side.parent },
              {
                where: withFilters(inArray(side.parent, parentKeys), computed.where, countPolicy),
                innerJoin: side.join,
                groupBy: [side.parent],
              },
            )
            for (const countRow of countRows) {
              counts.set(String(countRow.parent), Number(countRow.count))
            }
          }
          for (const row of rows)
            row[field] = Option.match(keyOf(row), {
              onNone: () => 0,
              onSome: key => counts.get(key) ?? 0,
            })
        }

        return rows.map(row => ({ id: String(row.id), values: row }))
      }),
    ...(options?.authorize === undefined ? {} : { authorize: options.authorize }),
    ...(options?.filter === undefined ? {} : { filter: options.filter }),
    ...(binding.visible === undefined ? {} : { visible: binding.visible }),
  }
}

/**
 * A `RemoteServer.query` source over a keyset-paginated table. The connection's
 * cursor is the row identity; a requested cursor's ordering tuple is re-read
 * before the page query, so the wire cursor stays a string.
 */
export const query = <P = unknown, Input = unknown>(
  descriptor: QueryDescriptor<string, Input, ConnectionSpec>,
  options: {
    readonly entity: AnyEntityBinding
    /**
     * The order of the rows, ending on a unique column. As a function it reads the
     * query's input, which is how a list sorts by what the user chose: the input is
     * part of the connection's identity, so each order pages on its own cursors. A
     * computed order that leaves the id out is tie-broken by it.
     *
     * Omitted when the descriptor carries a body (`Query.define`), whose own
     * ordering is compiled instead.
     */
    readonly orderBy?:
      | readonly OrderTerm[]
      | ((input: Input, principal: P) => readonly OrderTerm[])
      | undefined
    /**
     * Extra SQL this server adds, in its own dialect. With a body it is
     * conjoined with what the body compiled to rather than replacing it, so a
     * binding can narrow a query it did not write.
     */
    readonly where?: ((input: Input, principal: P) => SQL | undefined) | undefined
    readonly defaultPageSize?: number | undefined
    readonly maxPageSize?: number | undefined
  },
): QuerySource<P, DrizzleDatabase> => {
  const body = descriptor.body
  if (options.orderBy === undefined && body === undefined) {
    throw new Error(
      `[foldkit-remote-drizzle] query "${descriptor.name}" needs an orderBy, or a descriptor declared with Query.define whose body has one`,
    )
  }
  if (typeof options.orderBy !== 'function' && options.orderBy?.length === 0) {
    throw new Error(
      `[foldkit-remote-drizzle] query "${descriptor.name}" needs a non-empty, stable orderBy; add a unique tie-breaker column`,
    )
  }
  // What a body reads, its ordering's fields among it, is checked against the
  // binding at registration; an ordering the input chooses is resolved per
  // request.
  if (body !== undefined) checkFields(body, options.entity, descriptor.name)
  if (body !== undefined && body.orderBy.length === 0 && options.orderBy === undefined) {
    throw new Error(
      `[foldkit-remote-drizzle] query "${descriptor.name}" has a body with no ordering; a connection pages on a stable order, so give it one`,
    )
  }
  // One order, read by both sides: a client places rows by the body's.
  if (body !== undefined && body.orderBy.length > 0 && options.orderBy !== undefined) {
    throw new Error(
      `[foldkit-remote-drizzle] query "${descriptor.name}" declares its order in its body, so an orderBy here would order it otherwise than the client reads it`,
    )
  }
  // A live list's rows are read as the entity its query lists: a table of
  // another would answer ids that name no row of it.
  if (descriptor.Result.entity !== options.entity.name) {
    throw new Error(
      `[foldkit-remote-drizzle] query "${descriptor.name}" lists "${descriptor.Result.entity}", but is bound to ${options.entity.name}'s table`,
    )
  }
  return {
    query: descriptor.name,
    entity: options.entity.name,
    Input: descriptor.Input,
    ...(options.entity.visible === undefined ? {} : { visible: options.entity.visible }),
    run: ({ input, window, principal, viewer }) =>
      Effect.gen(function* () {
        if (
          (window.after !== undefined && window.before !== undefined) ||
          (window.first !== undefined && window.last !== undefined)
        ) {
          return yield* new RemoteServerError({
            message: 'A query window cannot combine after with before, or first with last',
          })
        }

        const binding = options.entity
        // The body compiles with what its `Expr.viewer` and `Expr.now` read, for this request.
        const target =
          body === undefined
            ? binding
            : {
                ...binding,
                context: exprContext(body, viewer, yield* Clock.currentTimeMillis),
                visibleOf: yield* reachedVisibility(binding, body, principal),
              }
        const shape = shapeWindow(window, {
          defaultSize: options.defaultPageSize,
          maxSize: options.maxPageSize,
        })
        const database = yield* DrizzleDatabase
        const id = idColumn(binding)
        // What the body reads is checked at registration, so a compile error
        // here is the request's input (a search holding NUL, a sort naming no
        // order offered): the client's to be told, as a query error, not a
        // defect. Anything else is a bug.
        const computed =
          typeof options.orderBy === 'function'
            ? options.orderBy(input as Input, principal)
            : (options.orderBy ??
              (body === undefined
                ? []
                : yield* compileFor(() =>
                    compileOrderBy(
                      body,
                      target,
                      input as Readonly<Record<string, unknown>>,
                      descriptor.name,
                    ),
                  )))
        // What the input asks for may not be unique, and neither is what a body
        // asks for: both say what the rows mean rather than how a cursor walks
        // them, so the id makes either stable. A literal order written here is
        // this binding's own, and stays exactly as it was given.
        const tieBreak = typeof options.orderBy === 'function' || options.orderBy === undefined
        const orderBy: readonly OrderTerm[] =
          !tieBreak || computed.some(term => term.key === id)
            ? computed
            : [...computed, { key: id, direction: 'asc' }]
        // The body's question, this server's own extra question, and the
        // binding's visibility rule are conjoined: a body can narrow what a
        // principal may see and never widen it.
        const compiled =
          body === undefined
            ? []
            : yield* compileFor(() =>
                compileWhere(
                  body,
                  target,
                  input as Readonly<Record<string, unknown>>,
                  descriptor.name,
                ),
              )
        const asked = options.where?.(input as Input, principal)
        const visible = yield* visibleFor(binding, principal)
        const baseWhere = and(...compiled, asked, visible)
        let where = baseWhere

        if (shape.cursor !== undefined) {
          const cursor = shape.cursor
          /** The order's keys at the row `cursorId` names, as it is now; none when it is not there. */
          const keysAt = (cursorId: string) =>
            Effect.map(
              selectRows(database, binding.table, cursorSelection(orderBy), {
                where:
                  baseWhere === undefined ? eq(id, cursorId) : and(baseWhere, eq(id, cursorId)),
                limit: 1,
              }),
              rows => Option.map(Option.fromUndefinedOr(rows[0]), row => keysOf(orderBy, row)),
            )
          const gone = new RemoteServerError({
            message: 'The query cursor no longer resolves to a row',
          })
          // A keyed cursor says where its page ended. One from before keys is an id,
          // whose row is read for its keys as it is now; such an id may begin as a
          // keyed cursor does, so a row holding the whole cursor as its id is that row.
          const read = readCursor(cursor, orderBy.length)
          const legacy = CursorRead.$is('Id')(read) ? Option.none() : yield* keysAt(cursor)
          const values: ReadonlyArray<unknown> = Option.isSome(legacy)
            ? legacy.value
            : yield* CursorRead.$match(read, {
                Keys: ({ values }) => Effect.succeed(values),
                Id: ({ id: cursorId }) =>
                  Effect.flatMap(
                    keysAt(cursorId),
                    Option.match({ onNone: () => Effect.fail(gone), onSome: Effect.succeed }),
                  ),
                Invalid: () =>
                  Effect.fail(
                    new RemoteServerError({
                      message: 'The query cursor is not one this server minted for this order',
                    }),
                  ),
              })
          const predicate = keysetWhere(orderBy, values, shape.traversal)
          where =
            where === undefined
              ? predicate
              : predicate === undefined
                ? where
                : and(where, predicate)
        }

        // Each order term under a key of its own: the id column may be named
        // anything, and may be one of them.
        const columns: Record<string, AnyColumn | SQL> = { id, ...cursorSelection(orderBy) }
        const rows = yield* selectRows(database, binding.table, columns, {
          where,
          orderBy: orderByTerms(orderBy, shape.traversal),
          limit: shape.pageSize + 1,
        })
        const natural = shape.traversal === 'backward' ? [...rows].reverse() : rows
        return toQueryPage({
          entity: binding.name,
          rows: natural,
          pageSize: shape.pageSize,
          traversal: shape.traversal,
          cursor: shape.cursor,
          idOf: row => String(row.id),
          cursorOf: row =>
            Option.getOrElse(keyCursor(keysOf(orderBy, row)), () => idCursor(String(row.id))),
        })
      }),
  }
}

/** Two values as a store holds them, which are JSON: equal when they encode the same. */
const sameStored = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

/**
 * Where a declared `Write` lands in this table, for `RemoteServer.write`: one
 * `update ... returning` of the row by id, setting each field's column to its
 * value as the store encodes it, and answering the written fields as they now
 * are. With `expect`, the row is written only while its revision column still
 * holds that value, and the column moves on by one in the same statement, so of
 * two writes from one revision one finds nothing to write. A binding with a
 * `visible` rule reads back through it (`read`), so an answer shows its writer
 * only a row they may read.
 */
/**
 * The SQL that makes a database move `binding`'s revision on every update that
 * does not move it itself: a handler's, `applyEdits`', raw SQL. A guarded
 * writer pinned to the revision then sees every change, not only those of
 * writers that cooperate. An update that sets the revision itself (a declared
 * write's, by one; a journal's, to a sequence) is left as it set it, so nothing
 * moves twice. Migrate with it once:
 *
 * ```ts
 * sqlite.exec(revisionTrigger(Db.Todo, 'revision'))
 * ```
 *
 * Not for a table Sync writes: `applyEdits` sets the revision to a commit
 * sequence, and a second change in one operation keeps it, which the trigger
 * would move past that sequence.
 */
export const revisionTrigger = (binding: AnyEntityBinding, revision: string): string => {
  const column = binding.columns[revision]
  if (column === undefined) {
    throw new Error(
      `[foldkit-remote-drizzle] revisionTrigger: ${binding.name} has no column for its revision "${revision}"`,
    )
  }
  const moved = quoted(column.name)
  const tableName = getTableName(binding.table)
  // One name per database (a Postgres function's, per schema): `a_b` and `c` would join
  // as `a` and `b_c` do, so a name holding `_` says where the table's name ends.
  const trigger =
    tableName.includes('_') || column.name.includes('_')
      ? `${tableName}_${column.name}_moves_${tableName.length}`
      : `${tableName}_${column.name}_moves`
  // Postgres cuts a longer name to 63 bytes, and two cut alike would be one again.
  if (!is(binding.table, SQLiteTable) && new TextEncoder().encode(trigger).length > 63) {
    throw new Error(
      `[foldkit-remote-drizzle] revisionTrigger: ${binding.name}'s trigger "${trigger}" is longer than Postgres's 63 bytes`,
    )
  }
  // Run again, it keeps (SQLite) or replaces (Postgres) what it made, rather than failing.
  if (is(binding.table, SQLiteTable)) {
    const table = quoted(getTableName(binding.table))
    const id = quoted(idColumn(binding).name)
    return `create trigger if not exists ${quoted(trigger)} after update on ${table} for each row when new.${moved} = old.${moved}
begin update ${table} set ${moved} = old.${moved} + 1 where ${id} = new.${id}; end;`
  }
  // A table in a `pgSchema` is named by it, and so is its function.
  const schema = getPgTableConfig(binding.table as PgTable).schema
  const within = (name: string) =>
    schema === undefined ? quoted(name) : `${quoted(schema)}.${quoted(name)}`
  const table = within(getTableName(binding.table))
  const name = within(trigger)
  return `create or replace function ${name}() returns trigger language plpgsql as $$
begin if new.${moved} = old.${moved} then new.${moved} := old.${moved} + 1; end if; return new; end $$;
create or replace trigger ${quoted(trigger)} before update on ${table} for each row execute function ${name}();`
}

/**
 * Where a writer records each update and insert it lands, by the operation that
 * asked for it, so a retry of that operation is answered from the record rather
 * than written again. Without one, a create of an id already taken is refused,
 * retry or not. A table the application migrates:
 *
 * ```sql
 * create table write_ledger (
 *   scope text not null, operation text not null, target text not null,
 *   answer text not null, at bigint not null, request text,
 *   primary key (scope, operation, target)
 * );
 * create index write_ledger_at on write_ledger (at);
 * ```
 *
 * `target` is the row (`Entity:id`), so one operation that updates two rows
 * records each, and an operation id sent again for another row is not that
 * row's retry. `at` is milliseconds, past a Postgres `integer`. `request` is
 * a SHA-256 digest of what the operation asked (its mutation, keys and
 * input): an operation id sent again with another request is refused rather
 * than answered as a retry. A ledger made before it gains the column with
 * `alter table write_ledger add column request text`; a record without one
 * is answered as a retry, as before, until its retention passes.
 */
export interface WriteLedger<P> {
  /** The ledger table, its columns named `scope`, `operation`, `target`, `answer`, `at` and `request`. */
  readonly table: Table & {
    readonly scope: AnyColumn
    readonly operation: AnyColumn
    readonly target: AnyColumn
    readonly answer: AnyColumn
    readonly at: AnyColumn
    readonly request: AnyColumn
  }
  /** Whose operations they are (a principal's key), so no one is answered with another's write. */
  readonly scope: (principal: P) => string
  /** How long an answer is kept, in milliseconds: a day unless given. A later retry is new. */
  readonly retention?: number
}

/** A SQLite statement, run where its transaction is: no await between it and the commit. */
interface SyncStatement {
  all(): ReadonlyArray<Record<string, unknown>>
  run(): unknown
}

/** A ledger transaction's builders, typed only as far as the ledger uses them. */
interface LedgerTx {
  select(columns: Record<string, AnyColumn | SQL>): {
    from(source: Table | SQL): PromiseLike<ReadonlyArray<Record<string, unknown>>> & {
      where(
        condition: SQL | undefined,
      ): SyncStatement & PromiseLike<ReadonlyArray<Record<string, unknown>>>
    }
  }
  insert(table: Table): {
    values(values: Record<string, unknown>): SyncStatement & PromiseLike<unknown>
  }
  delete(table: Table): { where(condition: SQL | undefined): SyncStatement & PromiseLike<unknown> }
  /** Postgres's only: the advisory lock that orders a retry behind its own original. */
  execute(query: SQL): PromiseLike<unknown>
}

/** The provided Drizzle database, as far as a ledger needs it: a transaction or a batch, and its kind. */
interface LedgerDatabase extends LedgerTx {
  /** `'sync'` for a driver whose statements run where they are called (node-sqlite, better-sqlite3). */
  readonly resultKind?: string
  transaction<A>(body: (tx: LedgerTx) => A): A
  /** D1's: statements run in order as one transaction, each one's result in its place. */
  batch(statements: ReadonlyArray<unknown>): PromiseLike<ReadonlyArray<unknown>>
  run(query: SQL): unknown
}

/** Whether the database is D1's, which refuses the `BEGIN` its Drizzle `transaction` sends. */
const isD1 = (database: unknown): boolean =>
  (database as { readonly constructor: { readonly [entityKind]?: string } }).constructor[
    entityKind
  ] === 'D1Database'

/** An answer as a ledger keeps it: JSON, a bigint as its digits. */
const answerText = (answer: unknown): string =>
  JSON.stringify(answer, (_, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  )

/** What one update did inside its ledger's transaction. */
type Ledgered =
  | { readonly _tag: 'Recorded'; readonly answer: string }
  | { readonly _tag: 'Written'; readonly rows: ReadonlyArray<Record<string, unknown>> }

const DAY = 24 * 60 * 60 * 1000

/** What an operation asked, as its ledger keeps it: the SHA-256 of the request, in hex. */
const digestOf = (request: string): Effect.Effect<string> =>
  Effect.map(
    Effect.promise(() => crypto.subtle.digest('SHA-256', new TextEncoder().encode(request))),
    hash => Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join(''),
  )

/**
 * Whether a ledger's record is of this request: one recorded before the ledger
 * kept requests holds none, and is taken as it, as it was before.
 */
const recordedFor = (found: Record<string, unknown>, digest: string): boolean =>
  found['request'] === null || found['request'] === digest

/**
 * Each binding's `ServerOnlyRules` report: the rules no CHECK can hold, worked
 * out once, as its first writer is built, and reported on its first write and
 * no other. Nothing when every rule has a CHECK.
 */
const serverOnlyReports = new WeakMap<AnyEntityBinding, Effect.Effect<void>>()
const serverOnlyReport = (binding: AnyEntityBinding): Effect.Effect<void> => {
  const known = serverOnlyReports.get(binding)
  if (known !== undefined) return known
  const { serverOnly } = checkConstraints(binding)
  let reported = false
  const report =
    serverOnly.length === 0
      ? Effect.void
      : Effect.suspend(() => {
          if (reported) return Effect.void
          reported = true
          return Diagnostics.report(
            serverOnlyRules(binding.name, getTableName(binding.table), serverOnly),
          )
        })
  serverOnlyReports.set(binding, report)
  return report
}

/** Whether a column holds integers: Drizzle names it `number int32`, `number int53`, `number uint16`… */
const holdsIntegers = (column: AnyColumn | undefined): boolean =>
  column !== undefined && /^number u?int\d+$/.test(column.dataType)

/**
 * What a write's precondition and its Entity's invariants may use: a writer is
 * given no viewer and no time yet, so neither context term.
 */
const writeOperations = supported.filter(operation => operation !== 'viewer' && operation !== 'now')

export const writer = <P = unknown>(
  binding: AnyEntityBinding,
  options: { readonly ledger?: WriteLedger<P> } = {},
): EntityWriter<P, DrizzleDatabase> => {
  const ledger = options.ledger
  // `set` is keyed by the table's own property names, not by its columns' SQL names.
  const keys = new Map<unknown, string>(
    Object.entries(getTableColumns(binding.table)).map(([key, column]) => [column, key]),
  )
  const keyOf = (field: string): string | undefined => {
    const column = binding.columns[field]
    return column === undefined ? undefined : keys.get(column)
  }
  const missing = (what: string) =>
    new RemoteServerError({ message: `${binding.name} has no ${what}` })
  // The rows as a principal may read them, under the binding's `visible`. A
  // writer reads stored fields (what it wrote, what a rule reads), never a
  // member answered per reader, so it reads with no viewer.
  const readable = source<P>(binding)

  const { invariants } = binding
  const invariantName = (held: Invariant) => `${binding.name}'s invariant "${held.id}"`
  // Checked and compiled once, so one this binding cannot run, in SQL or in
  // memory, fails where the writer is built.
  for (const held of invariants) {
    // An invariant reads the row after the write (`next`), which a query does not.
    requireOperators([held.predicate], binding, invariantName(held), [...writeOperations, 'next'])
    compilePredicates([held.predicate], binding, {}, invariantName(held))
  }
  // After the invariants are checked, so one this binding cannot run is refused by name first.
  const serverOnly = serverOnlyReport(binding)

  /**
   * Each invariant over the change an update makes, for its `where`: a field
   * before is its column; after, a field the write sets is its new value, one it
   * increments its column moved by the amount, and any other its column, which
   * the write leaves as it is. The rows the statement writes are the rows judged.
   */
  const holdingInvariants = (
    values: Readonly<Record<string, unknown>>,
    increments: Readonly<Record<string, number>>,
    assignments: Readonly<Record<string, Computation>>,
  ): Effect.Effect<ReadonlyArray<SQL>, RemoteServerError> =>
    compileFor(() => {
      const next: Record<string, AnyColumn | SQL> = Object.create(null)
      // A moved or computed field becomes its expression, and Drizzle's operators take
      // an expression where they take a column.
      for (const [field, amount] of Object.entries(increments)) {
        next[field] = sql`(${binding.columns[field]} + ${amount})`
      }
      for (const [field, computation] of Object.entries(assignments)) {
        next[field] = sql`(${computationSql(computation, binding, `${binding.name}'s "${field}"`)})`
      }
      // The binding's operators too: a value set can leave a call over literals
      // alone, which is decided in memory rather than compiled.
      const target = {
        table: binding.table,
        columns: binding.columns,
        next,
        operators: binding.operators,
      }
      return invariants.flatMap(held =>
        compilePredicates(
          [Expr.substituteNext(held.predicate, values)],
          target,
          {},
          invariantName(held),
        ),
      )
    })

  /**
   * The row an update would leave, as `Write.apply` works it out: what a
   * guard judges and the statement writes, so a miss is explained by the
   * same row.
   */
  const proposedOf = (
    row: Readonly<Record<string, unknown>>,
    bound: Parameters<typeof Write.apply>[1],
  ): Readonly<Record<string, unknown>> =>
    Write.apply(row, bound, { operators: binding.operators.memory }).row

  /**
   * Whether `assignment` lands as one result in any order: `field := op(field,
   * amount)`, the amount reading no field, with `op`'s commutativity and
   * associativity tested for both of this binding's implementations of it,
   * over every value (a law narrowed by `Law.within` holds of less than a
   * column may store).
   */
  const commutes = (assignment: WriteAssignment): boolean => {
    const { expr, field } = assignment
    if (expr._tag !== 'Call' || expr.args.length !== 2) return false
    const [own, amount] = expr.args
    if (own === undefined || amount === undefined || isPredicate(own) || own._tag !== 'Field') {
      return false
    }
    if (own.key !== field.key || dependenciesOf(amount).fields.length > 0) return false
    const name =
      expr.operator.version === 1
        ? expr.operator.id
        : `${expr.operator.id}@${expr.operator.version}`
    const tested = (evidence: ReadonlyArray<Evidence>, kind: string) =>
      evidence.some(
        record =>
          record._tag === 'Tested' &&
          record.operator === name &&
          record.law.kind === kind &&
          record.law.domain === null,
      )
    return ['commutative', 'associative'].every(
      kind =>
        tested(binding.operators.memory.evidence, kind) &&
        tested(binding.operators.sql.evidence, kind),
    )
  }

  /** The first of the invariants broken, as the refusal a writer answers it with. */
  const refusalOf = (failures: ReadonlyArray<Invariant>) =>
    Option.map(Arr.head(failures), held =>
      RemoteServer.invalid(held.message, Option.some(held.id), held.path),
    )

  /** The refusal for the first invariant a row or a change breaks; none for what it cannot judge. */
  const brokenIn = (change: Change) =>
    Match.value(DomainEntity.judgeAgainst(invariants, change, binding.operators.memory)).pipe(
      Match.tagsExhaustive({
        Valid: () => Option.none(),
        Undecided: () => Option.none(),
        Invalid: ({ failures }) => refusalOf(failures),
      }),
    )

  /** The columns a write sets: each field's value, and each `one` relation's foreign key. */
  const setOf = (
    values: Readonly<Record<string, unknown>>,
    links: Readonly<Record<string, Option.Option<EntityRef>>>,
  ): Effect.Effect<Record<string, unknown>, RemoteServerError> =>
    Effect.gen(function* () {
      const set: Record<string, unknown> = {}
      for (const [field, value] of Object.entries(values)) {
        const key = keyOf(field)
        if (key === undefined) return yield* missing(`column for "${field}" to write`)
        set[key] = value
      }
      for (const [field, link] of Object.entries(links)) {
        const relation = binding.relations[field]
        const key = relation?.kind === 'one' ? keys.get(relation.field) : undefined
        if (key === undefined) return yield* missing(`foreign key for "${field}" to write`)
        set[key] = Option.match(link, { onNone: () => null, onSome: ref => ref.id })
      }
      return set
    })

  /**
   * The row by id, while it is still at the expected revision when one is, and
   * while it holds the write's precondition when there is one: all in the
   * statement that writes it.
   */
  const rowOf = (
    id: string,
    expect: Option.Option<{ readonly field: string; readonly revision: unknown }>,
    when: Option.Option<WriteWhen>,
  ): Effect.Effect<
    { readonly where: SQL | undefined; readonly bump: Record<string, SQL> },
    RemoteServerError
  > =>
    Effect.gen(function* () {
      const holding = Option.isNone(when)
        ? []
        : yield* compileFor(() =>
            compileWhere(
              when.value.body,
              binding,
              when.value.input,
              `${binding.name}'s write precondition`,
            ),
          )
      if (Option.isNone(expect)) {
        return { where: and(eq(idColumn(binding), id), ...holding), bump: {} }
      }
      const { field, revision } = expect.value
      const column = binding.columns[field]
      const key = keyOf(field)
      if (column === undefined || key === undefined) {
        return yield* missing(`column for its revision "${field}"`)
      }
      return {
        where: and(eq(idColumn(binding), id), eq(column, revision), ...holding),
        bump: { [key]: sql`${column} + 1` },
      }
    })

  /**
   * What a write requires of its row (a guard's rule that reads another row),
   * as SQL over the row's table: each body compiled as a Read rule is, over
   * the rows it reaches as they are, since it is the server's decision.
   */
  const requiredOf = (
    requires: WriteRequirement | undefined,
  ): Effect.Effect<ReadonlyArray<SQL>, RemoteServerError> => {
    if (requires === undefined) return Effect.succeed([])
    const compile = RowRequirement.$match({
      Body: ({ query, input, context }): SQL =>
        and(
          ...compileWhere(
            query,
            { ...binding, context, visibleOf: () => Option.none() },
            input,
            `${binding.name}'s write rule`,
          ),
        ) ?? sql`true`,
      All: ({ of }): SQL => and(...of.map(compile)) ?? sql`true`,
      Any: ({ of }): SQL => or(...of.map(compile)) ?? sql`false`,
    })
    return compileFor(() => [compile(requires.holds)])
  }

  /**
   * Refused for who asks when the row is there and does not hold what the
   * write requires: read once the write missed, so a gone or moved row is
   * told as before.
   */
  const refusedBy = (
    id: string,
    requires: WriteRequirement | undefined,
    required: ReadonlyArray<SQL>,
  ) =>
    Effect.gen(function* () {
      if (requires === undefined) return
      const holding = yield* selectRows(
        yield* DrizzleDatabase,
        binding.table,
        { id: idColumn(binding) },
        { where: and(eq(idColumn(binding), id), ...required) },
      )
      if (holding.length > 0) return
      return yield* Effect.fail(RemoteServer.forbid(Option.getOrUndefined(requires.reason)))
    })

  /** Each assignment as its compiled computation, in the statement that writes. */
  const assignmentsOf = (
    assignments: Readonly<Record<string, Computation>>,
  ): Effect.Effect<Record<string, SQL>, RemoteServerError> =>
    Effect.gen(function* () {
      const set: Record<string, SQL> = {}
      for (const [field, computation] of Object.entries(assignments)) {
        const key = keyOf(field)
        if (binding.columns[field] === undefined || key === undefined) {
          return yield* missing(`column for "${field}" to compute`)
        }
        set[key] = yield* compileFor(() =>
          computationSql(computation, binding, `${binding.name}'s "${field}"`),
        )
      }
      return set
    })

  /** Each increment as its column moved by the amount, in the statement that writes. */
  const incrementsOf = (
    increments: Readonly<Record<string, number>>,
  ): Effect.Effect<Record<string, SQL>, RemoteServerError> =>
    Effect.gen(function* () {
      const set: Record<string, SQL> = {}
      for (const [field, amount] of Object.entries(increments)) {
        const column = binding.columns[field]
        const key = keyOf(field)
        if (column === undefined || key === undefined) {
          return yield* missing(`column for "${field}" to increment`)
        }
        set[key] = sql`${column} + ${amount}`
      }
      return set
    })

  const clocked = new Set(binding.clocked ?? [])
  /**
   * Whether `row` holds what a write set: each value, and each link as its ref.
   * A field set from the write's clock is left out: a retry is stamped anew, and
   * its time is no evidence the write differs (#291).
   */
  const holdsWritten = (
    row: Readonly<Record<string, unknown>>,
    values: Readonly<Record<string, unknown>>,
    links: Readonly<Record<string, Option.Option<EntityRef>>>,
  ): boolean =>
    Object.entries(values).every(
      ([key, value]) => clocked.has(key) || sameStored(row[key], value),
    ) &&
    Object.entries(links).every(([key, link]) =>
      sameStored(
        row[key],
        Option.match(link, { onNone: () => null, onSome: ref => Entity.refKey(ref) }),
      ),
    )

  const answeredOf = (
    rows: ReadonlyArray<Record<string, unknown>>,
    answered: ReturnType<typeof returning>,
  ): Option.Option<Readonly<Record<string, unknown>>> =>
    Option.map(Option.fromUndefinedOr(answered.patches(rows)[0]), patch => patch.values)

  /** A ledger's record of `operation`, unless past its retention, pruned yet or not: a retry that late is new. */
  const recordOf = (
    book: WriteLedger<P>,
    scope: string,
    operation: string,
    id: string,
    cutoff: number,
  ) =>
    and(
      eq(book.table.scope, scope),
      eq(book.table.operation, operation),
      eq(book.table.target, Entity.refKey({ entity: binding.name, id })),
      gte(book.table.at, cutoff),
    )

  /** An operation id the ledger holds for another request: never answered as its retry. */
  const reused = (operation: string, id: string) =>
    new RemoteServerError({
      message: `${binding.name} ${id}: operation "${operation}" was recorded for another request; a retry sends the same mutation, keys and input`,
    })

  /**
   * One update in a transaction with its ledger: the recorded answer when the
   * operation already landed, else the update, recorded when it writes a row.
   * The operation's id sent with another request (its mutation, keys and
   * input) is refused. SQLite's transaction is synchronous, so its body uses
   * `.all()` and `.run()` and awaits nothing; Postgres's is awaited.
   */
  const inLedger = (
    book: WriteLedger<P>,
    scope: string,
    operation: string,
    request: string,
    id: string,
    update: (database: unknown) => unknown,
    answered: ReturnType<typeof returning>,
  ): Effect.Effect<Ledgered, RemoteServerError, DrizzleDatabase> =>
    Effect.gen(function* () {
      const digest = yield* digestOf(request)
      const now = yield* Clock.currentTimeMillis
      const cutoff = now - (book.retention ?? DAY)
      const key = recordOf(book, scope, operation, id, cutoff)
      const expired = lt(book.table.at, cutoff)
      const target = Entity.refKey({ entity: binding.name, id })
      const answerOf = (rows: ReadonlyArray<Record<string, unknown>>) => answeredOf(rows, answered)
      const record = (answer: unknown) => ({
        scope,
        operation,
        target,
        answer: answerText(answer),
        at: now,
        request: digest,
      })
      const recordedOf = (
        found: ReadonlyArray<Record<string, unknown>>,
      ): Option.Option<Ledgered | { readonly _tag: 'Reused' }> =>
        Option.map(Option.fromUndefinedOr(found[0]), row =>
          recordedFor(row, digest)
            ? { _tag: 'Recorded', answer: String(row['answer']) }
            : { _tag: 'Reused' },
        )
      const asked = { answer: book.table.answer, request: book.table.request }
      // The database is the application's Drizzle one; its builders are not nameable by dialect.
      const database = (yield* DrizzleDatabase) as unknown as LedgerDatabase
      // D1 refuses the `BEGIN` its Drizzle `transaction` sends, but runs a batch as one
      // transaction, with no read between its statements. So the record is read first, and the
      // row and its record are written in one batch: the record only where the write changed a
      // row (`changes()`), holding the row as the write left it. A copy sent alongside found no
      // record either; whichever batch runs second meets the first's record, as a key its own
      // collides with (rolling its whole batch back) or as a write that misses, and is answered
      // from that record.
      const batched = Effect.gen(function* () {
        const lookup = Effect.map(
          runStatement(
            () => database.select(asked).from(book.table).where(key),
            'Database write failed',
          ),
          recordedOf,
        )
        const known = yield* lookup
        if (Option.isSome(known)) return known.value
        const { table } = book
        const recording = sql`insert into ${table} (${sql.join(
          [table.scope, table.operation, table.target, table.answer, table.at, table.request].map(
            column => sql.identifier(column.name),
          ),
          sql`, `,
        )}) select ${scope}, ${operation}, ${target}, json_object(${sql.join(
          Object.entries(answered.columns).map(([field, column]) => sql`${field}, ${column}`),
          sql`, `,
        )}), ${now}, ${digest} from ${binding.table} where ${eq(idColumn(binding), id)} and changes() > 0`
        const written = yield* Effect.result(
          Effect.tryPromise({
            try: () =>
              Promise.resolve(
                database.batch([
                  database.delete(table).where(expired),
                  update(database),
                  database.run(recording),
                ]),
              ),
            catch: error => error,
          }),
        )
        if (Result.isSuccess(written)) {
          const rows = written.success[1] as ReadonlyArray<Record<string, unknown>>
          if (rows.length > 0) return { _tag: 'Written', rows } satisfies Ledgered
        }
        const after = yield* lookup
        if (Option.isSome(after)) return after.value
        if (Result.isFailure(written)) {
          yield* Diagnostics.report(statementFailed('Database write failed', written.failure))
          return yield* new RemoteServerError({ message: 'Database write failed' })
        }
        return { _tag: 'Written', rows: [] } satisfies Ledgered
      })
      if (!isD1(database) && typeof database.transaction !== 'function') {
        return yield* new RemoteServerError({
          message: `${binding.name}'s ledger needs a database with transactions`,
        })
      }
      // A synchronous driver's transaction commits when its body returns, so the body awaits
      // nothing; an asynchronous one's (libsql, Postgres) is awaited.
      const done = isD1(database)
        ? yield* batched
        : database.resultKind === 'sync'
          ? yield* Effect.try({
              try: () =>
                database.transaction(tx =>
                  Option.getOrElse(
                    recordedOf(tx.select(asked).from(book.table).where(key).all()),
                    (): Ledgered => {
                      const rows = (update(tx) as SyncStatement).all()
                      Option.map(answerOf(rows), answer => {
                        tx.delete(book.table).where(expired).run()
                        tx.insert(book.table).values(record(answer)).run()
                      })
                      return { _tag: 'Written', rows }
                    },
                  ),
                ),
              catch: error => error,
            }).pipe(
              Effect.tapError(error =>
                Diagnostics.report(statementFailed('Database write failed', error)),
              ),
              Effect.mapError(() => new RemoteServerError({ message: 'Database write failed' })),
            )
          : yield* runStatement(
              () =>
                database.transaction(async tx => {
                  // Under READ COMMITTED a retry racing its original would find no record
                  // either, write too, and fail on the record's key: so the second waits
                  // here until the first commits, and then finds its record. Two keys that
                  // hash alike only share a lock.
                  if (!is(book.table, SQLiteTable)) {
                    await tx.execute(
                      sql`select pg_advisory_xact_lock(hashtextextended(${`${scope}:${operation}:${target}`}, 0))`,
                    )
                  }
                  const found = recordedOf(await tx.select(asked).from(book.table).where(key))
                  if (Option.isSome(found)) return found.value
                  const rows = await (update(tx) as PromiseLike<
                    ReadonlyArray<Record<string, unknown>>
                  >)
                  const answer = answerOf(rows)
                  if (Option.isSome(answer)) {
                    await tx.delete(book.table).where(expired)
                    await tx.insert(book.table).values(record(answer.value))
                  }
                  return { _tag: 'Written', rows } satisfies Ledgered
                }),
              'Database write failed',
            )
      if (done._tag === 'Reused') return yield* reused(operation, id)
      return done
    })

  /**
   * A record's answer as the write answered it. D1's batch records the row as its
   * columns held it (`json_object`), so each value is selected back through its column,
   * read as Drizzle reads that column (a boolean from 1), and kept as JSON, as the
   * other ledgers keep their answers.
   */
  const recordedAnswer = (
    database: DrizzleDatabaseService,
    record: string,
  ): Effect.Effect<Readonly<Record<string, unknown>>, RemoteServerError> => {
    const stored = JSON.parse(record) as Readonly<Record<string, unknown>>
    if (!isD1(database)) return Effect.succeed(stored)
    const fields = Object.keys(stored)
    const read = Object.fromEntries(
      Object.entries(selectColumns(binding, fields)).map(([field, column]) => [
        field,
        sql`json_extract(${record}, ${`$."${field}"`})`.mapWith(column),
      ]),
    )
    return Effect.map(
      runStatement(
        () => (database as unknown as LedgerDatabase).select(read).from(sql`(select 1)`),
        'Database query failed',
      ),
      // One row: `(select 1)` holds one.
      rows =>
        JSON.parse(answerText(relationRefs(binding, fields, rows[0]!))) as Readonly<
          Record<string, unknown>
        >,
    )
  }

  /**
   * A recorded operation's answer: the row as it now is, since the record's
   * values may be older than a later write; the record only if the row is gone.
   */
  const answerOfRecord = (
    id: string,
    answered: ReturnType<typeof returning>,
    record: string,
  ): Effect.Effect<Readonly<Record<string, unknown>>, RemoteServerError, DrizzleDatabase> =>
    Effect.gen(function* () {
      const database = yield* DrizzleDatabase
      const now = answeredOf(
        yield* selectRows(database, binding.table, answered.columns, {
          where: eq(idColumn(binding), id),
        }),
        answered,
      )
      return Option.isSome(now) ? now.value : yield* recordedAnswer(database, record)
    })

  return {
    entity: binding.name,
    preconditions: true,
    increments: true,
    assignments: true,
    requires: true,
    operators: binding.operators.memory,
    commutes,
    invariants: true,
    // A fraction added to an integer column splits the dialects: Postgres refuses the
    // statement, SQLite stores the fraction. A field declared Schema.Number hides the column.
    refuses: write => [
      ...write.increments.flatMap(({ key, field, integer }) =>
        !integer && holdsIntegers(binding.columns[field.key])
          ? [
              `"${key}" may not be an integer, but the column for "${field.key}" holds integers; give the amount Schema.Int`,
            ]
          : [],
      ),
      // Its precondition compiles into the statement and explains a miss in memory.
      ...Option.match(write.when, {
        onNone: () => [],
        onSome: body => operatorProblems(body.where, binding, 'its precondition', writeOperations),
      }),
      // So does each assignment, which a miss's row is worked out by.
      ...write.assignments.flatMap(({ field, expr }) =>
        operatorProblems([expr], binding, `its assignment to "${field.key}"`),
      ),
      // A fraction assigned to an integer column splits the dialects as an increment's does.
      ...write.assignments.flatMap(assignment =>
        !assignment.integer && holdsIntegers(binding.columns[assignment.field.key])
          ? [
              `its assignment to "${assignment.field.key}" may not be an integer, but the column for it holds integers; compute it with an operator, input or literal that is (Schema.Int)`,
            ]
          : [],
      ),
      ...contextOverwrites(write, binding),
    ],
    ...(ledger === undefined
      ? {}
      : {
          ledger: true,
          recorded: ({ operation, request, principal, id }) =>
            Effect.gen(function* () {
              const cutoff = (yield* Clock.currentTimeMillis) - (ledger.retention ?? DAY)
              const database = yield* DrizzleDatabase
              const found = yield* selectRows(
                database,
                ledger.table,
                { answer: ledger.table.answer, request: ledger.table.request },
                { where: recordOf(ledger, ledger.scope(principal), operation, id, cutoff) },
              )
              const record = Option.fromUndefinedOr(found[0])
              const digest = yield* digestOf(request)
              if (Option.isSome(record) && !recordedFor(record.value, digest)) {
                return yield* reused(operation, id)
              }
              if (Option.isNone(record)) return Option.none()
              return Option.some(yield* recordedAnswer(database, String(record.value['answer'])))
            }),
        }),
    update: ({
      id,
      values,
      increments,
      assignments,
      links,
      expect,
      when,
      requires,
      operation,
      request,
      principal,
    }) =>
      Effect.gen(function* () {
        yield* serverOnly
        const at = yield* rowOf(id, expect, when)
        const required = yield* requiredOf(requires)
        const where = and(
          at.where,
          ...required,
          ...(yield* holdingInvariants(values, increments, assignments)),
        )
        const { bump } = at
        const set = {
          ...(yield* setOf(values, links)),
          ...(yield* incrementsOf(increments)),
          ...(yield* assignmentsOf(assignments)),
          ...bump,
        }
        // A row a revision on could be another's increment or computation: only the
        // write itself says it landed, since neither repeats without effect.
        const incrementing = Object.keys(increments).length + Object.keys(assignments).length > 0
        const answeredFields = [
          ...Object.keys(values),
          ...Object.keys(increments),
          ...Object.keys(assignments),
          ...Object.keys(links),
          ...Option.match(expect, { onNone: () => [], onSome: ({ field }) => [field] }),
        ]
        const answered = returning(binding, answeredFields)
        const writes = yield* drizzleWrites
        // An operation the ledger knows is answered from it; a recorded write is never repeated.
        const book =
          ledger !== undefined && Object.keys(set).length > 0
            ? Option.map(operation, op => ({ ledger, op }))
            : Option.none()
        // Unrecorded and unrevisioned, a retry of an increment would add twice: whoever calls.
        if (incrementing && Option.isNone(expect) && Option.isNone(book)) {
          return yield* new RemoteServerError({
            message: `${binding.name} ${id}: an increment or computation with no revision is written only under a ledgered operation`,
          })
        }
        let rows: ReadonlyArray<Record<string, unknown>>
        if (Option.isSome(book)) {
          const done = yield* inLedger(
            book.value.ledger,
            book.value.ledger.scope(principal),
            book.value.op,
            request,
            id,
            tx =>
              (tx as DrizzleWrites)
                .update(binding.table)
                .set(set)
                .where(where)
                .returning(answered.columns),
            answered,
          )
          // Landed already: not written again.
          if (done._tag === 'Recorded')
            return Option.some(yield* answerOfRecord(id, answered, done.answer))
          rows = done.rows
        } else if (Object.keys(set).length === 0) {
          // Nothing to set: the row as it is, if it is there.
          rows = yield* selectRows(yield* DrizzleDatabase, binding.table, answered.columns, {
            where,
          })
        } else {
          rows = yield* runStatement(
            () => writes.update(binding.table).set(set).where(where).returning(answered.columns),
            'Database write failed',
          )
        }
        const written = answeredOf(rows, answered)
        const conditioned =
          Option.isSome(expect) ||
          Option.isSome(when) ||
          invariants.length > 0 ||
          requires !== undefined
        if (Option.isSome(written) || !conditioned) return written
        // The write missed. Why is read from the row as it is now: gone, moved
        // past the expected revision, not holding the precondition, or else
        // leaving a row that breaks an invariant. What those read is read too.
        const judged = returning(binding, [
          ...new Set([
            ...answeredFields,
            ...Option.match(when, {
              onNone: () => [],
              onSome: ({ body }) => Query.dependencies(body).predicate.map(field => field.key),
            }),
            ...invariants.flatMap(held => [...held.before, ...held.after]),
            ...Write.boundReads({ increments, assignments }),
          ]),
        ])
        const current = yield* selectRows(yield* DrizzleDatabase, binding.table, judged.columns, {
          where: eq(idColumn(binding), id),
        })
        const whole = answeredOf(current, judged)
        if (Option.isNone(whole)) return whole
        // Who may write it is refused first, as a guard refuses before all else.
        yield* refusedBy(id, requires, required)
        const row = whole.value
        // The same row with only what this write answers with: a patch keeps every column read.
        const answers = new Set(['id', ...answeredFields])
        const now = Option.some(
          Object.fromEntries(Object.entries(row).filter(([key]) => answers.has(key))),
        )
        if (Option.isSome(expect) && !sameStored(row[expect.value.field], expect.value.revision)) {
          // One revision past the expected one and holding these values, this
          // write landed already and its answer was lost: a retry answers the
          // row rather than conflicting with itself. A ledger consulted for it
          // would have answered such a retry, so with one this is another write.
          const { field, revision } = expect.value
          if (incrementing || Option.isSome(book)) return Option.none()
          return Option.filter(
            now,
            row =>
              typeof revision === 'number' &&
              row[field] === revision + 1 &&
              holdsWritten(row, values, links),
          )
        }
        const holdsWhen = Option.match(when, {
          onNone: () => true,
          onSome: ({ body, input }) =>
            evaluate(body, input, [row], { operators: binding.operators.memory }).length > 0,
        })
        // Unledgered, a row already holding what this write sets is taken for a
        // retry of one that landed, which neither its precondition nor a
        // transition invariant describes any more: writing it again changes
        // nothing, so it is judged as a row and not as a change. A guess: a
        // fresh write the row happens to agree with passes too. A ledger
        // consulted for it answers a retry itself, so with one nothing is guessed.
        const sets = Object.keys(values).length + Object.keys(links).length > 0
        const retried =
          Option.isNone(book) && sets && !incrementing && holdsWritten(row, values, links)
        // Holding its precondition, it missed by the row it would leave.
        if (holdsWhen) {
          const after = proposedOf(row, { values, increments, assignments })
          const broken = brokenIn(retried ? { after } : { before: row, after })
          if (Option.isSome(broken)) return yield* broken.value
        }
        if (retried) return now
        // A write with no precondition missed only by its revision.
        if (Option.isNone(when)) return Option.none()
        return yield* RemoteServer.unmet(
          `${binding.name} ${id} does not hold what the write asks of it`,
        )
      }),
    insert: ({ id, values, links, operation, request, principal }) =>
      Effect.gen(function* () {
        yield* serverOnly
        // There is no row yet: the row it would make is its values, judged before it is written.
        yield* Match.value(
          DomainEntity.judgeAgainst(
            invariants,
            { after: { ...values, id } },
            binding.operators.memory,
          ),
        ).pipe(
          Match.tagsExhaustive({
            Valid: () => Effect.void,
            Invalid: ({ failures }) =>
              Option.match(refusalOf(failures), { onNone: () => Effect.void, onSome: Effect.fail }),
            Undecided: ({ fields, operators }) =>
              Effect.fail(
                new RemoteServerError({
                  message: `${binding.name} ${id}: ${[
                    ...(fields.length > 0
                      ? [`an invariant reads ${fields.join(', ')}, which the insert does not set`]
                      : []),
                    ...(operators.length > 0
                      ? [
                          `an invariant calls ${operators.join(', ')}, which this server does not run`,
                        ]
                      : []),
                  ].join('; ')}`,
                }),
              ),
          }),
        )
        const idKey = keys.get(idColumn(binding))
        if (idKey === undefined) return yield* missing('id column to insert')
        const set = { ...(yield* setOf(values, links)), [idKey]: id }
        const answered = returning(binding, [...Object.keys(values), ...Object.keys(links)])
        const statement = (database: unknown) =>
          (database as DrizzleWrites)
            .insert(binding.table)
            .values(set)
            .onConflictDoNothing()
            .returning(answered.columns)
        // Only the ledger tells a retry from another create of a taken id. The row
        // there is never compared with this one, since it may hold what the asker
        // may not read, and a different answer per value would tell them.
        let inserted: ReadonlyArray<Record<string, unknown>>
        if (ledger !== undefined && Option.isSome(operation)) {
          const done = yield* inLedger(
            ledger,
            ledger.scope(principal),
            operation.value,
            request,
            id,
            statement,
            answered,
          )
          if (done._tag === 'Recorded') return yield* answerOfRecord(id, answered, done.answer)
          inserted = done.rows
        } else {
          const writes = yield* drizzleWrites
          inserted = yield* runStatement(() => statement(writes), 'Database write failed')
        }
        // Nothing inserted: the id is taken, and every such create is answered alike.
        return yield* Option.match(answeredOf(inserted, answered), {
          onNone: () =>
            Effect.fail(
              new RemoteServerError({ message: `${binding.name} ${id} could not be created` }),
            ),
          onSome: Effect.succeed,
        })
      }),
    delete: ({ id, expect, when, requires }) =>
      Effect.gen(function* () {
        yield* serverOnly
        const at = yield* rowOf(id, expect, when)
        const required = yield* requiredOf(requires)
        const where = and(at.where, ...required)
        const writes = yield* drizzleWrites
        const deleted = yield* runStatement(
          () =>
            writes
              .delete(binding.table)
              .where(where)
              .returning({ id: idColumn(binding) }),
          'Database write failed',
        )
        if (deleted.length > 0) return 'deleted'
        if (Option.isNone(expect) && Option.isNone(when) && requires === undefined) return 'absent'
        // The delete missed: gone is gone (a retry of this delete, or another's);
        // still there, it moved past the revision this delete expected, or else
        // does not hold its precondition.
        const revisionField = Option.map(expect, ({ field }) => field)
        const still = yield* selectRows(
          yield* DrizzleDatabase,
          binding.table,
          {
            id: idColumn(binding),
            ...Option.match(revisionField, {
              onNone: () => ({}),
              onSome: field => {
                const column = binding.columns[field]
                return column === undefined ? {} : { revision: column }
              },
            }),
          },
          { where: eq(idColumn(binding), id) },
        )
        const row = still[0]
        if (row === undefined) return 'absent'
        yield* refusedBy(id, requires, required)
        if (
          Option.isNone(when) ||
          (Option.isSome(expect) && !sameStored(row['revision'], expect.value.revision))
        ) {
          return 'moved'
        }
        return yield* RemoteServer.unmet(
          `${binding.name} ${id} does not hold what the delete asks of it`,
        )
      }),
    linked: ({ id, relations }) =>
      Effect.gen(function* () {
        const answered = returning(binding, relations)
        const rows = yield* selectRows(yield* DrizzleDatabase, binding.table, answered.columns, {
          where: eq(idColumn(binding), id),
        })
        return answeredOf(rows, answered)
      }),
    ...(binding.visible === undefined
      ? {}
      : {
          read: ({ id, fields, principal }) =>
            Effect.map(readable.read({ ids: [id], fields: [...fields], principal }), records =>
              Option.fromUndefinedOr(records.find(record => record.id === id)?.values),
            ),
        }),
  }
}

/**
 * A journal's `apply` for `foldkit-sync`'s `editsJournal`: one committed cell
 * edit, written to its column with the sequence it committed at as the row's
 * revision, in one statement that never moves a row back. An older edit run
 * after a newer one (recovery runs an intent again) changes nothing; `<=`, not
 * `<`, so a second change to one row in one operation lands too. The column is
 * the binding's for the member, never one named by the change's text.
 *
 * Here the revision is the journal's sequence. A table a journal writes this
 * way should not also take writes that `expect` a counter there.
 */
export const applyEdits = <P = unknown>(
  binding: AnyEntityBinding,
  options: {
    readonly revision?: string
    /**
     * A hub to tell of each edit applied, so a Remote reader following the row
     * live hears it once the journal applies it. An edit the row had already
     * passed (recovery running it again) changes nothing and is not told.
     */
    readonly live?: LiveHub<P, DrizzleDatabase>
  } = {},
) => {
  const revisionField = options.revision ?? 'revision'
  const keys = new Map<unknown, string>(
    Object.entries(getTableColumns(binding.table)).map(([key, column]) => [column, key]),
  )
  const revision = binding.columns[revisionField]
  const revisionKey = revision === undefined ? undefined : keys.get(revision)
  if (revision === undefined || revisionKey === undefined) {
    throw new Error(
      `[foldkit-remote-drizzle] applyEdits: ${binding.name} has no column for its revision "${revisionField}"`,
    )
  }
  const fields = binding.fields as Readonly<Record<string, Schema.Top | undefined>>
  return (
    change: { readonly id: string; readonly member: string; readonly value: unknown },
    at: number,
  ): Effect.Effect<void, RemoteServerError, DrizzleDatabase> =>
    Effect.gen(function* () {
      const column = binding.columns[change.member]
      const key = column === undefined ? undefined : keys.get(column)
      const schema = fields[change.member]
      if (column === undefined || key === undefined || schema === undefined) {
        return yield* new RemoteServerError({
          message: `${binding.name} has no column for "${change.member}" to apply`,
        })
      }
      const writes = yield* drizzleWrites
      const value = Schema.encodeUnknownSync(schema as Schema.Codec<unknown, unknown>)(change.value)
      const written = yield* runStatement(
        () =>
          writes
            .update(binding.table)
            .set({ [key]: value, [revisionKey]: at })
            .where(and(eq(idColumn(binding), change.id), lte(revision, at)))
            .returning({ id: idColumn(binding) }),
        'Database write failed',
      )
      const hub = options.live
      if (hub !== undefined && written.length > 0) {
        yield* hub.changed({ entity: binding.name, id: change.id }, [change.member, revisionField])
      }
    })
}

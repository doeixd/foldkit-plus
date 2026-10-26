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
import { getTableConfig as getPgTableConfig, PgDialect, type PgTable } from 'drizzle-orm/pg-core'
import { SQLiteDialect, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { Array as Arr, Clock, Effect, Match, Option, Schema } from 'effect'
import {
  Entity as DomainEntity,
  Expr,
  Query,
  evaluate,
  type EntityRef,
  type Change,
  type Invariant,
} from 'foldkit-entity'
import type { NormalizedPatch, QueryDescriptor } from 'foldkit-remote'
import { Entity } from 'foldkit-remote'
import {
  RemoteServer,
  RemoteServerError,
  type EntityRecord,
  type EntityWriter,
  type LiveHub,
  type EntitySource,
  type EntitySourceContext,
  type QuerySource,
  type WriteWhen,
} from 'foldkit-remote-server'
import type { AnyEntityBinding, ManyRelation, ManyToManyRelation } from './binding.js'
import { idColumn, projectsAny } from './columns.js'
import {
  checkFields,
  compileOrderBy,
  compilePredicates,
  compileWhere,
  operatorProblems,
  QueryCompileError,
  requireOperators,
  supported,
} from './compile.js'
import {
  cursorSelection,
  keyCursor,
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
import { buildPage } from './pagination.js'
import { shapeWindow } from './window.js'

export * from './bind.js'
export * from './compile.js'
export * from './binding.js'
export * from './columns.js'
export * from './cursor.js'
export * from './operators.js'
export * from './database.js'
export * from './page.js'
export * from './pagination.js'
export * from './window.js'

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
  readonly join: { readonly table: Table; readonly on: SQL } | undefined
  readonly parentKey: AnyColumn
} => {
  const child = idColumn(relation.entity)
  return relation.kind === 'many'
    ? {
        table: relation.entity.table,
        parent: relation.foreignKey,
        child,
        join: undefined,
        parentKey: relation.localKey,
      }
    : {
        table: relation.through,
        parent: relation.localColumn,
        child,
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
 * driver's error carries the SQL and its parameters: it is logged for
 * operators and never sent, where a defect would reach the client over RPC.
 * Run every statement a handler makes through it.
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
    Effect.tapError(error => Effect.logError(`[foldkit-remote-drizzle] ${failed}`, error)),
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
 * target ids in one `IN (...)`. `options.policies` adds a principal-scoped filter
 * to a collection relation (e.g. only rows this principal may see), and
 * `options.filter` decides what a principal sees of each record, as
 * `RemoteServer.entity`'s does.
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
  },
): EntitySource<P, DrizzleDatabase> => {
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
  return {
    entity: binding.name,
    fields: new Set(Object.keys(binding.fields)),
    ...(options?.shared === undefined ? {} : { shared: new Set(options.shared) }),
    read: context =>
      Effect.gen(function* () {
        if (context.ids.length === 0) return []
        if (!projectsAny(binding, context.fields)) return []
        const database = yield* DrizzleDatabase
        const columns = selectColumns(binding, context.fields)
        for (const field of context.fields) {
          const computed = binding.computed[field]
          if (computed === undefined) continue
          const relation = binding.relations[computed.relation]
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
          const order: ReadonlyArray<OrderTerm> = declared.some(term => term.column === targetId)
            ? declared
            : [...declared, { column: targetId, direction: 'asc' }]
          const naturalOrder = orderByTerms(order, 'forward')
          const parentKeys = [
            ...new Set(
              rows.map(row => row[field]).filter(key => key !== null && key !== undefined),
            ),
          ]

          if (window !== undefined) {
            const shape = shapeWindow(window, { defaultSize: 20 })
            if (shape.cursor !== undefined && context.ids.length !== 1) {
              return yield* new RemoteServerError({
                message: `Relation "${field}" cursor needs a single parent`,
              })
            }
            const empty = { refs: [] as ReadonlyArray<string>, hasNext: false, hasPrevious: false }
            const traversalOrder = orderByTerms(order, shape.traversal)

            let keyset: SQL | undefined
            if (shape.cursor !== undefined) {
              const cursorRows = yield* selectRows(
                database,
                relation.entity.table,
                cursorSelection(order),
                { where: eq(targetId, cursorId(shape.cursor)), limit: 1 },
              )
              const cursorRow = cursorRows[0]
              if (cursorRow === undefined) {
                return yield* new RemoteServerError({
                  message: `Relation "${field}" cursor no longer resolves`,
                })
              }
              keyset = keysetWhere(
                order,
                order.map(term => cursorRow[term.column.name]),
                shape.traversal,
              )
            }

            const byParent = new Map<string, Array<Record<string, unknown>>>()
            if (parentKeys.length > 0) {
              const where = withFilters(
                inArray(side.parent, parentKeys),
                relation.where,
                policyWhere,
                keyset,
              )
              // One statement for every parent: rank each parent's children in
              // a window and keep the first `pageSize + 1` of each, so the
              // statement count does not grow with the number of parents.
              const ranking = sql`row_number() over (partition by ${side.parent} order by ${sql.join([...traversalOrder], sql`, `)})`
              const joined =
                side.join === undefined
                  ? sql`${side.table}`
                  : sql`${side.table} inner join ${side.join.table} on ${side.join.on}`
              const ranked = sql`(select p, k from (select ${side.parent} as p, ${targetId} as k, ${ranking} as rn from ${joined} where ${where}) as ranked where rn <= ${shape.pageSize + 1})`
              const childRows = yield* selectRows(
                database,
                side.table,
                { child: targetId, parent: side.parent },
                {
                  where: sql`(${side.parent}, ${targetId}) in ${ranked}`,
                  innerJoin: side.join,
                  orderBy: traversalOrder,
                },
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

          const byParent = new Map<string, string[]>()
          if (parentKeys.length > 0) {
            const childRows = yield* selectRows(
              database,
              side.table,
              { child: targetId, parent: side.parent },
              {
                where: withFilters(inArray(side.parent, parentKeys), relation.where, policyWhere),
                innerJoin: side.join,
                orderBy: naturalOrder,
              },
            )
            for (const child of childRows) {
              const refs = byParent.get(String(child.parent)) ?? []
              refs.push(Entity.refKey({ entity: relation.entity.name, id: String(child.child) }))
              byParent.set(String(child.parent), refs)
            }
          }
          // The inverse side of a one-to-one reads as the one ref, or none.
          const single = relation.kind === 'many' && relation.single === true
          for (const row of rows) {
            const key = row[field]
            const refs = key === null || key === undefined ? [] : (byParent.get(String(key)) ?? [])
            row[field] = single ? (refs[0] ?? null) : refs
          }
        }

        for (const field of context.fields) {
          const computed = binding.computed[field]
          if (computed === undefined) continue
          const relation = binding.relations[computed.relation]
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
          const counts = new Map<string, number>()
          const countVisible = yield* visibleFor(relation.entity, context.principal)
          const countRelation = pick(options?.policies, computed.relation)?.(context.principal)
          // A count of rows the principal may not see would say how many there are.
          const countPolicy =
            countRelation === undefined || countVisible === undefined
              ? (countRelation ?? countVisible)
              : and(countRelation, countVisible)
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
          for (const row of rows) {
            const key = row[side.parentKey.name]
            row[field] = key === null || key === undefined ? 0 : (counts.get(String(key)) ?? 0)
          }
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
  descriptor: QueryDescriptor<string, Input, unknown>,
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
  return {
    query: descriptor.name,
    Input: descriptor.Input,
    ...(options.entity.visible === undefined ? {} : { visible: options.entity.visible }),
    run: ({ input, window, principal }) =>
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
                      binding,
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
          !tieBreak || computed.some(term => term.column === id)
            ? computed
            : [...computed, { column: id, direction: 'asc' }]
        // The body's question, this server's own extra question, and the
        // binding's visibility rule are conjoined: a body can narrow what a
        // principal may see and never widen it.
        const compiled =
          body === undefined
            ? []
            : yield* compileFor(() =>
                compileWhere(
                  body,
                  binding,
                  input as Readonly<Record<string, unknown>>,
                  descriptor.name,
                ),
              )
        const asked = options.where?.(input as Input, principal)
        const visible = yield* visibleFor(binding, principal)
        const baseWhere = and(...compiled, asked, visible)
        let where = baseWhere

        if (shape.cursor !== undefined) {
          // A keyed cursor says where its page ended. One from before keys is
          // an id, whose row is read for its keys as it is now.
          const values: ReadonlyArray<unknown> = yield* CursorRead.$match(
            readCursor(shape.cursor, orderBy.length),
            {
              Keys: ({ values }) => Effect.succeed(values),
              Id: ({ id: cursorId }) =>
                Effect.gen(function* () {
                  const cursorRows = yield* selectRows(
                    database,
                    binding.table,
                    cursorSelection(orderBy),
                    {
                      where:
                        baseWhere === undefined
                          ? eq(id, cursorId)
                          : and(baseWhere, eq(id, cursorId)),
                      limit: 1,
                    },
                  )
                  const cursorRow = cursorRows[0]
                  if (cursorRow === undefined) {
                    return yield* new RemoteServerError({
                      message: 'The query cursor no longer resolves to a row',
                    })
                  }
                  return orderBy.map(term => cursorRow[term.column.name])
                }),
              Invalid: () =>
                Effect.fail(
                  new RemoteServerError({
                    message: 'The query cursor is not one this server minted for this order',
                  }),
                ),
            },
          )
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
        const columns: Record<string, AnyColumn> = {
          id,
          ...Object.fromEntries(orderBy.map((term, index) => [`key${index}`, term.column])),
        }
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
            Option.getOrElse(keyCursor(orderBy.map((_, index) => row[`key${index}`])), () =>
              String(row.id),
            ),
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
/** A name as SQL quotes it, its own quotes doubled. */
const quoted = (name: string): string => `"${name.replaceAll('"', '""')}"`

/**
 * Each of the binding's invariants as a `CHECK` constraint, for the migration
 * that makes the table: what holds against every write, a handler's and raw
 * SQL's too, which the writer's own statement does not reach. Each is
 * `constraint "<table>_<id>" check ((…) is true)`, since a plain check passes a
 * row its condition calls unknown (a null) and an invariant does not. The
 * values it compares are written into the SQL, which a constraint needs.
 *
 * ```ts
 * for (const { constraint } of invariantChecks(Db.Stock)) {
 *   await pglite.exec(`alter table stock add ${constraint}`) // Postgres
 * }
 * // SQLite adds none to a table: write each in its `create table`.
 * ```
 *
 * Refuses, by name, an invariant the dialect cannot compile.
 */
export const invariantChecks = (
  binding: AnyEntityBinding,
): ReadonlyArray<{ readonly name: string; readonly constraint: string }> => {
  const dialect = is(binding.table, SQLiteTable) ? new SQLiteDialect() : new PgDialect()
  // A constraint sees one row, so only a state invariant (reading no row before) is one.
  return binding.invariants
    .filter(held => !DomainEntity.readsBefore(held))
    .map(held => {
      const what = `${binding.name}'s invariant "${held.id}"`
      const condition = sql.join(
        [...compilePredicates([held.predicate], binding, {}, what)],
        sql` and `,
      )
      const query = dialect.sqlToQuery(sql`(${condition}) is true`.inlineParams())
      if (query.params.length > 0) {
        throw new QueryCompileError(`${what} compares a value a constraint cannot hold`)
      }
      const name = `${getTableName(binding.table)}_${held.id}`
      return { name, constraint: `constraint ${quoted(name)} check (${query.sql})` }
    })
}

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
  const trigger = `${getTableName(binding.table)}_${column.name}_moves`
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
 * Where a writer records each update it lands, by the operation that asked for
 * it, so a retry of that operation is answered from the record rather than
 * written again. A table the application migrates:
 *
 * ```sql
 * create table write_ledger (
 *   scope text not null, operation text not null, target text not null,
 *   answer text not null, at bigint not null,
 *   primary key (scope, operation, target)
 * );
 * create index write_ledger_at on write_ledger (at);
 * ```
 *
 * `target` is the row (`Entity:id`), so one operation that updates two rows
 * records each, and an operation id sent again for another row is not that
 * row's retry. `at` is milliseconds, past a Postgres `integer`.
 */
export interface WriteLedger<P> {
  /** The ledger table, its columns named `scope`, `operation`, `target`, `answer` and `at`. */
  readonly table: Table & {
    readonly scope: AnyColumn
    readonly operation: AnyColumn
    readonly target: AnyColumn
    readonly answer: AnyColumn
    readonly at: AnyColumn
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
  select(columns: Record<string, AnyColumn>): {
    from(table: Table): {
      where(
        condition: SQL | undefined,
      ): SyncStatement & PromiseLike<ReadonlyArray<Record<string, unknown>>>
    }
  }
  insert(table: Table): {
    values(values: Record<string, unknown>): SyncStatement & PromiseLike<unknown>
  }
  delete(table: Table): { where(condition: SQL | undefined): SyncStatement & PromiseLike<unknown> }
}

/** The provided Drizzle database, as far as a ledger needs it: a transaction, and its kind. */
interface LedgerDatabase {
  /** `'sync'` for a driver whose statements run where they are called (node-sqlite, better-sqlite3). */
  readonly resultKind?: string
  transaction<A>(body: (tx: LedgerTx) => A): A
}

/** What one update did inside its ledger's transaction. */
type Ledgered =
  | { readonly _tag: 'Recorded'; readonly answer: string }
  | { readonly _tag: 'Written'; readonly rows: ReadonlyArray<Record<string, unknown>> }

const DAY = 24 * 60 * 60 * 1000

/** Whether a column holds integers: Drizzle names it `number int32`, `number int53`, `number uint16`… */
const holdsIntegers = (column: AnyColumn | undefined): boolean =>
  column !== undefined && /^number u?int\d+$/.test(column.dataType)

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
  // The rows as a principal may read them, under the binding's `visible`.
  const readable = source<P>(binding)

  const { invariants } = binding
  const invariantName = (held: Invariant) => `${binding.name}'s invariant "${held.id}"`
  // Checked and compiled once, so one this binding cannot run, in SQL or in
  // memory, fails where the writer is built.
  for (const held of invariants) {
    // An invariant reads the row after the write (`next`), which a query does not.
    requireOperators([held.predicate], binding, invariantName(held), [...supported, 'next'])
    compilePredicates([held.predicate], binding, {}, invariantName(held))
  }

  /**
   * Each invariant over the change an update makes, for its `where`: a field
   * before is its column; after, a field the write sets is its new value, one it
   * increments its column moved by the amount, and any other its column, which
   * the write leaves as it is. The rows the statement writes are the rows judged.
   */
  const holdingInvariants = (
    values: Readonly<Record<string, unknown>>,
    increments: Readonly<Record<string, number>>,
  ): Effect.Effect<ReadonlyArray<SQL>, RemoteServerError> =>
    compileFor(() => {
      const next: Record<string, AnyColumn> = Object.create(null)
      for (const [field, amount] of Object.entries(increments)) {
        // An incremented field is a number, compared with no collation, and Drizzle's
        // operators take an expression where they take a column.
        next[field] = sql`(${binding.columns[field]} + ${amount})` as unknown as AnyColumn
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

  /** The row an update would leave: the row as it is, with its values set and amounts added. */
  const proposedOf = (
    row: Readonly<Record<string, unknown>>,
    values: Readonly<Record<string, unknown>>,
    increments: Readonly<Record<string, number>>,
  ): Readonly<Record<string, unknown>> => {
    const proposed: Record<string, unknown> = { ...row, ...values }
    for (const [field, amount] of Object.entries(increments)) {
      const held = row[field]
      proposed[field] = typeof held === 'number' ? held + amount : held
    }
    return proposed
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

  /** Whether `row` holds what a write set: each value, and each link as its ref. */
  const holdsWritten = (
    row: Readonly<Record<string, unknown>>,
    values: Readonly<Record<string, unknown>>,
    links: Readonly<Record<string, Option.Option<EntityRef>>>,
  ): boolean =>
    Object.entries(values).every(([key, value]) => sameStored(row[key], value)) &&
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

  /**
   * One update in a transaction with its ledger: the recorded answer when the
   * operation already landed, else the update, recorded when it writes a row.
   * SQLite's transaction is synchronous, so its body uses `.all()` and `.run()`
   * and awaits nothing; Postgres's is awaited.
   */
  const inLedger = (
    book: WriteLedger<P>,
    scope: string,
    operation: string,
    id: string,
    update: (database: unknown) => unknown,
    answerOf: (rows: ReadonlyArray<Record<string, unknown>>) => Option.Option<unknown>,
  ): Effect.Effect<Ledgered, RemoteServerError, DrizzleDatabase> =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const cutoff = now - (book.retention ?? DAY)
      const key = recordOf(book, scope, operation, id, cutoff)
      const expired = lt(book.table.at, cutoff)
      const record = (answer: unknown) => ({
        scope,
        operation,
        target: Entity.refKey({ entity: binding.name, id }),
        // Only the answer for a row since gone; a bigint goes as its digits.
        answer: JSON.stringify(answer, (_, value: unknown) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
        at: now,
      })
      // The database is the application's Drizzle one; its builders are not nameable by dialect.
      const database = (yield* DrizzleDatabase) as unknown as LedgerDatabase
      // D1's Drizzle database has a `transaction`, which sends a `BEGIN` that D1 refuses.
      if (
        typeof database.transaction !== 'function' ||
        (database.constructor as { readonly [entityKind]?: string })[entityKind] === 'D1Database'
      ) {
        return yield* new RemoteServerError({
          message: `${binding.name}'s ledger needs a database with transactions`,
        })
      }
      // A synchronous driver's transaction commits when its body returns, so the body awaits
      // nothing; an asynchronous one's (libsql, Postgres) is awaited.
      if (database.resultKind === 'sync') {
        return yield* Effect.try({
          try: () =>
            database.transaction(tx => {
              const found = tx
                .select({ answer: book.table.answer })
                .from(book.table)
                .where(key)
                .all()
              if (found[0] !== undefined)
                return { _tag: 'Recorded', answer: String(found[0].answer) }
              const rows = (update(tx) as SyncStatement).all()
              Option.map(answerOf(rows), answer => {
                tx.delete(book.table).where(expired).run()
                tx.insert(book.table).values(record(answer)).run()
              })
              return { _tag: 'Written', rows }
            }) as Ledgered,
          catch: error => error,
        }).pipe(
          Effect.tapError(error =>
            Effect.logError('[foldkit-remote-drizzle] Database write failed', error),
          ),
          Effect.mapError(() => new RemoteServerError({ message: 'Database write failed' })),
        )
      }
      return yield* runStatement(
        () =>
          database.transaction(async tx => {
            const found = await tx.select({ answer: book.table.answer }).from(book.table).where(key)
            if (found[0] !== undefined) return { _tag: 'Recorded', answer: String(found[0].answer) }
            const rows = await (update(tx) as PromiseLike<ReadonlyArray<Record<string, unknown>>>)
            const answer = answerOf(rows)
            if (Option.isSome(answer)) {
              await tx.delete(book.table).where(expired)
              await tx.insert(book.table).values(record(answer.value))
            }
            return { _tag: 'Written', rows }
          }) as PromiseLike<Ledgered>,
        'Database write failed',
      )
    })

  return {
    entity: binding.name,
    preconditions: true,
    increments: true,
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
        onSome: body => operatorProblems(body.where, binding, 'its precondition'),
      }),
    ],
    ...(ledger === undefined
      ? {}
      : {
          ledger: true,
          recorded: ({ operation, principal, id }) =>
            Effect.gen(function* () {
              const cutoff = (yield* Clock.currentTimeMillis) - (ledger.retention ?? DAY)
              const found = yield* selectRows(
                yield* DrizzleDatabase,
                ledger.table,
                { answer: ledger.table.answer },
                { where: recordOf(ledger, ledger.scope(principal), operation, id, cutoff) },
              )
              return Option.map(
                Option.fromUndefinedOr(found[0]),
                row => JSON.parse(String(row['answer'])) as Readonly<Record<string, unknown>>,
              )
            }),
        }),
    update: ({ id, values, increments, links, expect, when, operation, principal }) =>
      Effect.gen(function* () {
        const at = yield* rowOf(id, expect, when)
        const where = and(at.where, ...(yield* holdingInvariants(values, increments)))
        const { bump } = at
        const set = {
          ...(yield* setOf(values, links)),
          ...(yield* incrementsOf(increments)),
          ...bump,
        }
        // A row a revision on could be another's increment: only the write itself says it landed.
        const incrementing = Object.keys(increments).length > 0
        const answeredFields = [
          ...Object.keys(values),
          ...Object.keys(increments),
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
        if (Object.keys(increments).length > 0 && Option.isNone(expect) && Option.isNone(book)) {
          return yield* new RemoteServerError({
            message: `${binding.name} ${id}: an increment with no revision is written only under a ledgered operation`,
          })
        }
        let rows: ReadonlyArray<Record<string, unknown>>
        if (Option.isSome(book)) {
          const done = yield* inLedger(
            book.value.ledger,
            book.value.ledger.scope(principal),
            book.value.op,
            id,
            tx =>
              (tx as DrizzleWrites)
                .update(binding.table)
                .set(set)
                .where(where)
                .returning(answered.columns),
            landed => answeredOf(landed, answered),
          )
          if (done._tag === 'Recorded') {
            // Landed already: not written again, and answered as the row now is, since the
            // record's values may be older than a later write; the record only if it is gone.
            const now = answeredOf(
              yield* selectRows(yield* DrizzleDatabase, binding.table, answered.columns, {
                where: eq(idColumn(binding), id),
              }),
              answered,
            )
            return Option.orElse(now, () =>
              Option.some(JSON.parse(done.answer) as Readonly<Record<string, unknown>>),
            )
          }
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
        const conditioned = Option.isSome(expect) || Option.isSome(when) || invariants.length > 0
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
          ]),
        ])
        const current = yield* selectRows(yield* DrizzleDatabase, binding.table, judged.columns, {
          where: eq(idColumn(binding), id),
        })
        const whole = answeredOf(current, judged)
        if (Option.isNone(whole)) return whole
        const row = whole.value
        // The same row with only what this write answers with: a patch keeps every column read.
        const answers = new Set(['id', ...answeredFields])
        const now = Option.some(
          Object.fromEntries(Object.entries(row).filter(([key]) => answers.has(key))),
        )
        if (Option.isSome(expect) && !sameStored(row[expect.value.field], expect.value.revision)) {
          // One revision past the expected one and holding these values, this
          // write landed already and its answer was lost: a retry answers the
          // row rather than conflicting with itself.
          const { field, revision } = expect.value
          if (incrementing) return Option.none()
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
        // A row already holding what this write sets is a retry of one that
        // landed, which neither its precondition nor a transition invariant
        // describes any more: writing it again changes nothing, so it is judged
        // as a row and not as a change.
        const sets = Object.keys(values).length + Object.keys(links).length > 0
        const retried = sets && !incrementing && holdsWritten(row, values, links)
        // Holding its precondition, it missed by the row it would leave.
        if (holdsWhen) {
          const after = proposedOf(row, values, increments)
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
    insert: ({ id, values, links }) =>
      Effect.gen(function* () {
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
        const writes = yield* drizzleWrites
        const inserted = yield* runStatement(
          () =>
            writes
              .insert(binding.table)
              .values(set)
              .onConflictDoNothing()
              .returning(answered.columns),
          'Database write failed',
        )
        if (inserted.length > 0) {
          return yield* Option.match(answeredOf(inserted, answered), {
            onNone: () => Effect.fail(missing(`row ${id} after inserting it`)),
            onSome: Effect.succeed,
          })
        }
        // Nothing inserted: the id is taken. A retry of this insert finds the row
        // holding what it wrote, and is answered with it; anything else is another
        // row, whose values are not this write's to answer with.
        const there = answeredOf(
          yield* selectRows(yield* DrizzleDatabase, binding.table, answered.columns, {
            where: eq(idColumn(binding), id),
          }),
          answered,
        )
        return yield* Option.match(
          Option.filter(there, row => holdsWritten(row, values, links)),
          {
            onNone: () =>
              Effect.fail(
                new RemoteServerError({ message: `${binding.name} ${id} could not be created` }),
              ),
            onSome: Effect.succeed,
          },
        )
      }),
    delete: ({ id, expect, when }) =>
      Effect.gen(function* () {
        const { where } = yield* rowOf(id, expect, when)
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
        if (Option.isNone(expect) && Option.isNone(when)) return 'absent'
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

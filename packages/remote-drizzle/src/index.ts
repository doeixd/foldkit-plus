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
  inArray,
  lte,
  sql,
  type AnyColumn,
  type SQL,
  type Table,
} from 'drizzle-orm'
import { Effect, Option, Schema } from 'effect'
import type { EntityRef } from 'foldkit-entity'
import type { NormalizedPatch, QueryDescriptor } from 'foldkit-remote'
import { Entity } from 'foldkit-remote'
import {
  RemoteServerError,
  type EntityRecord,
  type EntityWriter,
  type LiveHub,
  type EntitySource,
  type EntitySourceContext,
  type QuerySource,
} from 'foldkit-remote-server'
import type { AnyEntityBinding, ManyRelation, ManyToManyRelation } from './binding.js'
import { idColumn, projectsAny } from './columns.js'
import { checkFields, compileOrderBy, compileWhere, QueryCompileError } from './compile.js'
import {
  cursorSelection,
  keyCursor,
  keysetWhere,
  orderByTerms,
  readCursor,
  CursorRead,
  type OrderTerm,
} from './cursor.js'
import { DrizzleDatabase, drizzleWrites, type DrizzleDatabaseService } from './database.js'
import { toQueryPage } from './page.js'
import { buildPage } from './pagination.js'
import { shapeWindow } from './window.js'

export * from './bind.js'
export * from './compile.js'
export * from './binding.js'
export * from './columns.js'
export * from './cursor.js'
export * from './database.js'
export * from './page.js'
export * from './pagination.js'
export * from './window.js'

/**
 * An own-property lookup. Request field names are client-supplied and relation
 * names are developer-supplied, so an inherited member like `toString` must not
 * satisfy the lookup.
 */
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
    ): Effect.Effect<ReadonlyArray<NormalizedPatch>, never, DrizzleDatabase> =>
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
        const rows = yield* Effect.promise(() =>
          Promise.resolve(
            database
              .select(columns)
              .from(binding.table)
              .where(whereIds(binding, [id])),
          ),
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
  return Effect.tryPromise({
    try: () => Promise.resolve(statement),
    catch: (error: unknown) => error,
  }).pipe(
    // The driver detail is for operators; the client gets no schema or SQL.
    Effect.tapError(error =>
      Effect.logError('[foldkit-remote-drizzle] database query failed', error),
    ),
    Effect.mapError(() => new RemoteServerError({ message: 'Database query failed' })),
  )
}

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
 * to a collection relation (e.g. only rows this principal may see).
 */
export const source = <P = unknown>(
  binding: AnyEntityBinding,
  options?: {
    readonly authorize?: EntitySource<P, DrizzleDatabase>['authorize'] | undefined
    readonly policies?:
      Readonly<Record<string, ((principal: P) => SQL | undefined) | undefined>> | undefined
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
  return {
    entity: binding.name,
    fields: new Set(Object.keys(binding.fields)),
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
          where: withFilters(whereIds(binding, context.ids), binding.visible?.(context.principal)),
        })

        for (const field of context.fields) {
          const relation = binding.relations[field]
          if (relation === undefined) continue

          // The relation's own policy, and the rows of its target this principal may see.
          const targetVisible = relation.entity.visible?.(context.principal)
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
          const countVisible = relation.entity.visible?.(context.principal)
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
      readonly OrderTerm[] | ((input: Input, principal: P) => readonly OrderTerm[]) | undefined
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
        const compileFor = <A>(compile: () => A) =>
          Effect.suspend(() => {
            try {
              return Effect.succeed(compile())
            } catch (error) {
              if (error instanceof QueryCompileError)
                return Effect.fail(new RemoteServerError({ message: error.message }))
              throw error
            }
          })
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
        const visible = binding.visible?.(principal)
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

        const columns: Record<string, AnyColumn> = { id }
        for (const term of orderBy) {
          if (!Object.values(columns).includes(term.column)) columns[term.column.name] = term.column
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
            Option.getOrElse(keyCursor(orderBy.map(term => row[term.column.name])), () =>
              String(row.id),
            ),
        })
      }),
  }
}

/**
 * Where a declared `Write` lands in this table, for `RemoteServer.write`: one
 * `update ... returning` of the row by id, setting each field's column to its
 * value as the store encodes it, and answering the written fields as they now
 * are. With `expect`, the row is written only while its revision column still
 * holds that value, and the column moves on by one in the same statement, so of
 * two writes from one revision one finds nothing to write.
 */
/** Two values as a store holds them, which are JSON: equal when they encode the same. */
const sameStored = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

export const writer = <P = unknown>(
  binding: AnyEntityBinding,
): EntityWriter<P, DrizzleDatabase> => {
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

  /** The row by id, and while it is still at the expected revision when one is. */
  const rowOf = (
    id: string,
    expect: Option.Option<{ readonly field: string; readonly revision: unknown }>,
  ): Effect.Effect<
    { readonly where: SQL | undefined; readonly bump: Record<string, SQL> },
    RemoteServerError
  > =>
    Effect.gen(function* () {
      if (Option.isNone(expect)) return { where: eq(idColumn(binding), id), bump: {} }
      const { field, revision } = expect.value
      const column = binding.columns[field]
      const key = keyOf(field)
      if (column === undefined || key === undefined) {
        return yield* missing(`column for its revision "${field}"`)
      }
      return {
        where: and(eq(idColumn(binding), id), eq(column, revision)),
        bump: { [key]: sql`${column} + 1` },
      }
    })

  const answeredOf = (
    rows: ReadonlyArray<Record<string, unknown>>,
    answered: ReturnType<typeof returning>,
  ): Option.Option<Readonly<Record<string, unknown>>> =>
    Option.map(Option.fromUndefinedOr(answered.patches(rows)[0]), patch => patch.values)

  return {
    entity: binding.name,
    update: ({ id, values, links, expect }) =>
      Effect.gen(function* () {
        const { where, bump } = yield* rowOf(id, expect)
        const set = { ...(yield* setOf(values, links)), ...bump }
        const answered = returning(binding, [
          ...Object.keys(values),
          ...Object.keys(links),
          ...Option.match(expect, { onNone: () => [], onSome: ({ field }) => [field] }),
        ])
        const writes = yield* drizzleWrites
        const rows =
          Object.keys(set).length === 0
            ? // Nothing to set: the row as it is, if it is there.
              yield* selectRows(yield* DrizzleDatabase, binding.table, answered.columns, { where })
            : yield* Effect.promise(() =>
                Promise.resolve(
                  writes.update(binding.table).set(set).where(where).returning(answered.columns),
                ),
              )
        const written = answeredOf(rows, answered)
        if (Option.isSome(written) || Option.isNone(expect)) return written
        // The guard missed. If the row is one revision past the expected one and
        // holds these values, this write landed already and its answer was lost:
        // a retry answers the row rather than conflicting with itself.
        const now = answeredOf(
          yield* selectRows(yield* DrizzleDatabase, binding.table, answered.columns, {
            where: eq(idColumn(binding), id),
          }),
          answered,
        )
        const { field, revision } = expect.value
        const landed = Option.filter(now, row => {
          const linked = Object.entries(links).every(([key, link]) =>
            sameStored(
              row[key],
              Option.match(link, { onNone: () => null, onSome: ref => Entity.refKey(ref) }),
            ),
          )
          return (
            typeof revision === 'number' &&
            row[field] === revision + 1 &&
            Object.entries(values).every(([key, value]) => sameStored(row[key], value)) &&
            linked
          )
        })
        return landed
      }),
    insert: ({ id, values, links }) =>
      Effect.gen(function* () {
        const idKey = keys.get(idColumn(binding))
        if (idKey === undefined) return yield* missing('id column to insert')
        const set = { ...(yield* setOf(values, links)), [idKey]: id }
        const answered = returning(binding, [...Object.keys(values), ...Object.keys(links)])
        const writes = yield* drizzleWrites
        const inserted = yield* Effect.promise(() =>
          Promise.resolve(
            writes
              .insert(binding.table)
              .values(set)
              .onConflictDoNothing()
              .returning(answered.columns),
          ),
        )
        // Nothing inserted: the id is taken, by a retry of this insert. Answer that row.
        const rows =
          inserted.length > 0
            ? inserted
            : yield* selectRows(yield* DrizzleDatabase, binding.table, answered.columns, {
                where: eq(idColumn(binding), id),
              })
        return yield* Option.match(answeredOf(rows, answered), {
          onNone: () => Effect.fail(missing(`row ${id} after inserting it`)),
          onSome: Effect.succeed,
        })
      }),
    delete: ({ id, expect }) =>
      Effect.gen(function* () {
        const { where } = yield* rowOf(id, expect)
        const writes = yield* drizzleWrites
        const deleted = yield* Effect.promise(() =>
          Promise.resolve(
            writes
              .delete(binding.table)
              .where(where)
              .returning({ id: idColumn(binding) }),
          ),
        )
        if (deleted.length > 0) return 'deleted'
        if (Option.isNone(expect)) return 'absent'
        // The guard missed: gone is gone (a retry of this delete, or another's);
        // still there means it moved past the revision this delete expected.
        const still = yield* selectRows(
          yield* DrizzleDatabase,
          binding.table,
          { id: idColumn(binding) },
          { where: eq(idColumn(binding), id) },
        )
        return still.length === 0 ? 'absent' : 'moved'
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
      const written = yield* Effect.promise(() =>
        Promise.resolve(
          writes
            .update(binding.table)
            .set({ [key]: value, [revisionKey]: at })
            .where(and(eq(idColumn(binding), change.id), lte(revision, at)))
            .returning({ id: idColumn(binding) }),
        ),
      )
      const hub = options.live
      if (hub !== undefined && written.length > 0) {
        yield* hub.changed({ entity: binding.name, id: change.id }, [change.member, revisionField])
      }
    })
}

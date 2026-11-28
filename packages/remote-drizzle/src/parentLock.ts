/**
 * Postgres parent-row locking (`SELECT ... FOR UPDATE`) and transactional
 * stored-total updates (Phase 4 Part B, Bout 4.17).
 *
 * Locking parents in ascending id order ensures concurrent writes touching
 * overlapping parent sets (such as opposite-direction transfers `a -> b` and
 * `b -> a`) acquire locks in the exact same order and never deadlock.
 */
import { asc, inArray, is } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { Effect } from 'effect'
import { RemoteServerError } from 'foldkit-remote-server'
import { DrizzleDatabase, type DrizzleWrites } from './database.js'

/** A Drizzle transaction handle exposed inside `withParentLock` / `ParentLock.onWrite`. */
export interface ParentLockTransaction extends DrizzleWrites {
  readonly select: (columns?: Record<string, unknown>) => {
    readonly from: (table: PgTable) => {
      readonly where: (condition: unknown) => PromiseLike<ReadonlyArray<Record<string, unknown>>>
    }
  }
  readonly execute: (query: unknown) => PromiseLike<unknown>
}

/** Options for locking parent rows on Postgres during child writes. */
export interface ParentLock<Field extends string = string> {
  /** The Postgres parent table whose rows are locked with `SELECT ... FOR UPDATE`. */
  readonly table: PgTable
  /** The parent table's primary key column. */
  readonly id: PgColumn
  /** Foreign-key or link field names on the child entity that identify parent row ids. */
  readonly by: ReadonlyArray<Field>
  /**
   * Optional hook run inside the same transaction after locking the parent rows
   * and writing the child, e.g. to update a stored aggregate total on the parent.
   */
  readonly onWrite?: (context: {
    readonly parentIds: ReadonlyArray<string>
    readonly tx: ParentLockTransaction
  }) => PromiseLike<void> | void
}

/** Deduplicate and sort parent ids in deterministic ascending code-unit order. */
export const sortParentIds = (ids: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

interface PgLockTransaction {
  readonly select: (columns: { readonly id: PgColumn }) => {
    readonly from: (table: PgTable) => {
      readonly where: (condition: unknown) => {
        readonly orderBy: (order: unknown) => {
          readonly for: (strength: 'update') => PromiseLike<ReadonlyArray<{ readonly id: unknown }>>
        }
      }
    }
  }
}

/**
 * Lock `parentIds` on `table` in ascending id order using `SELECT ... FOR UPDATE`.
 * Returns the sorted ids that were locked.
 */
export const lockParents = async (
  tx: unknown,
  table: PgTable,
  idColumn: PgColumn,
  parentIds: ReadonlyArray<string>,
): Promise<ReadonlyArray<string>> => {
  const sorted = sortParentIds(parentIds)
  if (sorted.length === 0) return []
  const rows = await (tx as PgLockTransaction)
    .select({ id: idColumn })
    .from(table)
    .where(inArray(idColumn, sorted))
    .orderBy(asc(idColumn))
    .for('update')
  return rows.map(row => String(row.id))
}

interface TransactionalDatabase {
  readonly transaction: <R>(run: (tx: unknown) => Promise<R>) => Promise<R>
}

/**
 * Run `body` inside a Postgres transaction that first locks `parentIds` on
 * `table` in ascending id order (`SELECT ... FOR UPDATE`), preventing deadlocks
 * across concurrent multi-parent writes and serializing aggregate rules.
 */
export const withParentLock = <A>(
  table: PgTable,
  idColumn: PgColumn,
  parentIds: ReadonlyArray<string>,
  body: (tx: ParentLockTransaction, lockedIds: ReadonlyArray<string>) => PromiseLike<A> | A,
): Effect.Effect<A, RemoteServerError, DrizzleDatabase> =>
  Effect.gen(function* () {
    if (is(table, SQLiteTable)) {
      return yield* new RemoteServerError({
        message:
          '[foldkit-remote-drizzle] withParentLock is supported on Postgres only; SQLite/D1 has no SELECT ... FOR UPDATE.',
      })
    }
    const database = (yield* DrizzleDatabase) as unknown as TransactionalDatabase
    return yield* Effect.tryPromise<A, RemoteServerError>({
      try: () =>
        database.transaction(async tx => {
          const locked = await lockParents(tx, table, idColumn, parentIds)
          return await body(tx as ParentLockTransaction, locked)
        }),
      catch: cause =>
        cause instanceof RemoteServerError
          ? cause
          : new RemoteServerError({ message: 'Database write failed', cause }),
    })
  })

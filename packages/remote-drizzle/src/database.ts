/**
 * The Drizzle database service.
 *
 * The adapter captures no connection: generated sources yield this service and
 * the application provides it — for example `Layer.succeed(DrizzleDatabase, db)`
 * over any Drizzle database whose select builder is thenable.
 *
 * `drizzle-orm/effect-postgres` is deliberately not imported. Its driver pulls
 * in `cache/core/cache-effect.ts`, which calls `Schema.TaggedErrorClass`, a name
 * no Effect 4 release exports (4.0.0 included), so the module throws on load. Requiring
 * this tag lets an application provide a Drizzle database today and swap in the
 * Effect driver when the two versions agree.
 */
import type { AnyColumn, InferInsertModel, SQL, Table } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'

export interface DrizzleStatement extends PromiseLike<ReadonlyArray<Record<string, unknown>>> {
  where(condition: SQL | undefined): DrizzleStatement
  innerJoin(table: Table, on: SQL): DrizzleStatement
  groupBy(...columns: AnyColumn[]): DrizzleStatement
  orderBy(...order: SQL[]): DrizzleStatement
  limit(count: number): DrizzleStatement
}

export interface DrizzleSelect {
  from(table: Table): DrizzleStatement
}

export interface DrizzleDatabaseService {
  select(selection: Record<string, AnyColumn | SQL>): DrizzleSelect
}

export class DrizzleDatabase extends Context.Service<DrizzleDatabase, DrizzleDatabaseService>()(
  'foldkit-remote-drizzle/DrizzleDatabase',
) {}

/**
 * Provides a Drizzle database as the `DrizzleDatabase` service. Any Drizzle
 * database qualifies; the cast is confined here because its builder is generic
 * over dialect and is not structurally nameable.
 */
export const databaseLayer = (database: unknown): Layer.Layer<DrizzleDatabase> =>
  Layer.succeed(DrizzleDatabase, database as DrizzleDatabaseService)

/** A write statement: awaited for its effect, or asked for the columns it wrote. */
export interface DrizzleWrite extends PromiseLike<unknown> {
  returning(columns: Record<string, AnyColumn>): PromiseLike<ReadonlyArray<Record<string, unknown>>>
}

/** The writes any Drizzle database for SQLite or Postgres offers, typed by each table's columns. */
export interface DrizzleWrites {
  insert<T extends Table>(table: T): { values(values: InferInsertModel<T>): DrizzleWrite }
  update<T extends Table>(
    table: T,
  ): {
    set(values: Partial<InferInsertModel<T>>): { where(condition: SQL | undefined): DrizzleWrite }
  }
  delete(table: Table): { where(condition: SQL | undefined): DrizzleWrite }
}

/**
 * The provided database's writes. `DrizzleDatabaseService` names only the reads a
 * source makes, so a test can fake it with `select`; a Drizzle database has
 * these too, and the cast that says so is confined here, as `databaseLayer`'s is.
 */
export const drizzleWrites: Effect.Effect<DrizzleWrites, never, DrizzleDatabase> = Effect.gen(
  function* () {
    return (yield* DrizzleDatabase) as unknown as DrizzleWrites
  },
)

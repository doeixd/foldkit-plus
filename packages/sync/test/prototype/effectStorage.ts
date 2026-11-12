/**
 * Prototypes of Sync's `Storage` over Effect's browser storage, for the
 * acceptance criteria of `effect-reuse-sync-durable-DESIGN.md` §14.2. Not a
 * public export and not a replacement.
 *
 * `keyValueStorage` is §10's shape: the whole replica under one key of a
 * `KeyValueStore`, compare-and-swap through `modify`. `transactionalStorage`
 * uses `@effect/platform-browser`'s typed IndexedDB, whose `withTransaction`
 * runs several queries in one `IDBTransaction` and aborts it on failure, so it
 * keeps `indexedDb`'s layout: the state, its revision and an outbox.
 */
import * as BrowserKeyValueStore from '@effect/platform-browser/BrowserKeyValueStore'
import * as IndexedDb from '@effect/platform-browser/IndexedDb'
import * as IndexedDbDatabase from '@effect/platform-browser/IndexedDbDatabase'
import * as IndexedDbTable from '@effect/platform-browser/IndexedDbTable'
import * as IndexedDbVersion from '@effect/platform-browser/IndexedDbVersion'
import { Context, Effect, Layer, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { StorageError, type OutboxEntry, type Storage } from '../../src/index.js'

const failed = (message: string) => (cause: unknown) =>
  new StorageError({
    message: `${message}: ${cause instanceof Error ? cause.message : String(cause)}`,
    cause,
  })

const conflict = () => new StorageError({ message: 'Replica was changed by another writer' })

const KEY = 'replica'

/**
 * The replica as one JSON value. `modify` updates a key only if it exists, so a
 * first save checks with `has` and writes with `set`.
 */
export const keyValueStorage = (database: string) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      BrowserKeyValueStore.layerIndexedDb({ database }).pipe(Layer.provide(IndexedDb.layerWindow)),
    )
    const store = Context.get(context, KeyValueStore.KeyValueStore)
    const storage: Storage = {
      load: () =>
        store.get(KEY).pipe(
          Effect.map(text => (text === undefined ? undefined : (JSON.parse(text) as unknown))),
          Effect.mapError(failed('Could not read the replica')),
        ),
      save: (state, expectedRevision) =>
        Effect.gen(function* () {
          const saving = failed('Could not save the replica')
          const text = JSON.stringify(state)
          if (expectedRevision === null) {
            if (yield* Effect.mapError(store.has(KEY), saving)) return yield* conflict()
            return yield* Effect.mapError(store.set(KEY, text), saving)
          }
          const written = yield* Effect.mapError(
            store.modify(KEY, current =>
              (JSON.parse(current) as { revision: number }).revision === expectedRevision
                ? text
                : current,
            ),
            saving,
          )
          if (written !== text) return yield* conflict()
        }),
      close: Effect.void,
    }
    return storage
  })

const Replica = IndexedDbTable.make({
  name: 'replica',
  schema: Schema.Struct({ value: Schema.Unknown }),
})

const Outbox = IndexedDbTable.make({
  name: 'outbox',
  schema: Schema.Struct({
    localSequence: Schema.Number,
    revision: Schema.Number,
    nextLocalSequence: Schema.Number,
    operation: Schema.Unknown,
  }),
  keyPath: 'localSequence',
})

const ReplicaDatabase = IndexedDbDatabase.make(IndexedDbVersion.make(Replica, Outbox), query =>
  Effect.gen(function* () {
    yield* query.createObjectStore('replica')
    yield* query.createObjectStore('outbox')
  }),
)

/** `indexedDb`'s layout and compare-and-swap, through Effect's typed IndexedDB. */
export const transactionalStorage = (database: string) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      ReplicaDatabase.layer(database).pipe(Layer.provide(IndexedDb.layerWindow)),
    )
    const query = yield* ReplicaDatabase.getQueryBuilder.pipe(Effect.provideContext(context))
    const value = (key: string) =>
      Effect.map(query.from('replica').select().equals(key), rows => rows[0]?.value)
    const write = (expectedRevision: number | null, writing: Effect.Effect<unknown, unknown>) =>
      Effect.gen(function* () {
        const revision = (yield* value('revision')) ?? null
        if (revision !== expectedRevision) return yield* conflict()
        yield* writing
      }).pipe(
        query.withTransaction({
          tables: ['replica', 'outbox'],
          mode: 'readwrite',
          durability: 'strict',
        }),
        Effect.mapError(cause =>
          cause instanceof StorageError ? cause : failed('Could not save the replica')(cause),
        ),
      )
    const storage: Required<Storage> = {
      load: () =>
        Effect.gen(function* () {
          const saved = (yield* value('state')) as
            | { readonly pending: ReadonlyArray<{ readonly localSequence?: unknown }> }
            | undefined
          const entries = (yield* query.from('outbox').select()) as ReadonlyArray<OutboxEntry>
          const latest = entries[entries.length - 1]
          if (saved === undefined || latest === undefined) return saved
          const replaced = new Set(entries.map(entry => entry.localSequence))
          return {
            ...saved,
            revision: latest.revision,
            nextLocalSequence: latest.nextLocalSequence,
            pending: [
              ...saved.pending.filter(
                operation => !replaced.has(operation.localSequence as number),
              ),
              ...entries.map(entry => entry.operation),
            ],
          }
        }).pipe(
          query.withTransaction({ tables: ['replica', 'outbox'], mode: 'readonly' }),
          Effect.mapError(failed('Could not read the replica')),
        ),
      save: (state, expectedRevision) =>
        write(
          expectedRevision,
          Effect.all([
            query.from('replica').upsert({ key: 'state', value: state }),
            query
              .from('replica')
              .upsert({ key: 'revision', value: (state as { revision: number }).revision }),
            query.from('outbox').clear,
          ]),
        ),
      append: (entry, expectedRevision) =>
        write(
          expectedRevision,
          Effect.all([
            query.from('outbox').upsert(entry),
            query.from('replica').upsert({ key: 'revision', value: entry.revision }),
          ]),
        ),
      close: Effect.sync(() => query.database.current.close()),
    }
    return storage
  })

import { Config, Effect, type Scope } from 'effect'
import { StorageError } from './errors.js'

/** One submitted operation, as `Storage.append` records it. */
export interface OutboxEntry {
  /** The replica's revision once this operation is in its outbox. */
  readonly revision: number
  readonly nextLocalSequence: number
  /**
   * The operation's local sequence. An entry with the sequence of one already in the
   * outbox replaces it: a coalesced submit rewrites the last operation.
   */
  readonly localSequence: number
  /** The operation, encoded. */
  readonly operation: unknown
}

/** Persists a replica's state with compare-and-swap on its revision. */
export interface Storage {
  /**
   * The saved state, with every operation appended since in its `pending` (replacing the
   * one of the same local sequence), and the last one's `revision` and `nextLocalSequence`.
   */
  load: () => Effect.Effect<unknown, StorageError>
  /** Replaces the whole state, and with it every appended operation. */
  save: (state: unknown, expectedRevision: number | null) => Effect.Effect<void, StorageError>
  /**
   * Optional. Records one submitted operation without rewriting the rest of the state, so
   * a submit costs the operation's size rather than the document's. Without it, a submit
   * saves the whole state.
   */
  append?: (entry: OutboxEntry, expectedRevision: number) => Effect.Effect<void, StorageError>
  /** Idempotent; the caller closes the connection explicitly. */
  close: Effect.Effect<void>
}

const storageError = (message: string, cause: unknown): StorageError =>
  new StorageError({
    message: `${message}: ${cause instanceof Error ? cause.message : String(cause)}`,
    cause,
  })

const openDatabase = (
  name: string,
  factory: IDBFactory,
): Effect.Effect<IDBDatabase, StorageError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(name, 2)
        // Version 2 adds the outbox that `append` writes; a version 1 database keeps its
        // state, and its revision is read from that state until the next write.
        request.onupgradeneeded = event => {
          const database = request.result
          if (event.oldVersion < 1) database.createObjectStore('replica')
          if (event.oldVersion < 2) database.createObjectStore('outbox')
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        // Without this, a version upgrade blocked by another open connection
        // never settles and the effect hangs.
        request.onblocked = () =>
          reject(new Error('IndexedDB upgrade is blocked by another connection'))
      }),
    catch: cause => storageError('Could not open the storage', cause),
  })

/** One database per document/replica; CAS prevents two tabs from sharing a writer identity. */
export const indexedDb = Effect.fn('Storage.indexedDb')(function* (
  name: Config.Config<string> | string,
  factory: IDBFactory = globalThis.indexedDB,
) {
  const databaseName =
    typeof name === 'string'
      ? name
      : yield* name.pipe(
          Effect.catchTag('ConfigError', cause =>
            Effect.fail(storageError('Could not read the storage name', cause)),
          ),
        )
  const database = yield* Effect.acquireRelease(openDatabase(databaseName, factory), database =>
    Effect.sync(() => database.close()),
  )
  database.onversionchange = () => database.close()
  /**
   * Writes under compare-and-swap: `write` runs only if the stored revision is the one
   * expected. The revision is its own key, so an append need not read the state; a database
   * written before it existed has it inside the state.
   */
  const write = (
    expectedRevision: number | null,
    writing: (replica: IDBObjectStore, outbox: IDBObjectStore) => void,
  ): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['replica', 'outbox'], 'readwrite', {
        durability: 'strict',
      })
      const replica = transaction.objectStore('replica')
      let conflict = false
      const check = (revision: number | null): void => {
        if (revision !== expectedRevision) {
          conflict = true
          transaction.abort()
          return
        }
        writing(replica, transaction.objectStore('outbox'))
      }
      const stored = replica.get('revision')
      stored.onsuccess = () => {
        if (stored.result !== undefined) return check(stored.result as number)
        const state = replica.get('state')
        state.onsuccess = () =>
          check((state.result as { revision: number } | undefined)?.revision ?? null)
      }
      transaction.oncomplete = () => resolve()
      transaction.onabort = () =>
        reject(
          conflict
            ? new Error('Replica was changed by another writer')
            : (transaction.error ?? new Error('IndexedDB write aborted')),
        )
    })
  // Every member, `append` included, so a caller need not check for it.
  const storage: Required<Storage> = {
    load: () =>
      Effect.tryPromise({
        try: () =>
          new Promise((resolve, reject) => {
            const transaction = database.transaction(['replica', 'outbox'], 'readonly')
            const state = transaction.objectStore('replica').get('state')
            // In key order, which is local-sequence order.
            const appended = transaction.objectStore('outbox').getAll()
            transaction.oncomplete = () => {
              const saved = state.result as
                { pending: ReadonlyArray<{ readonly localSequence?: unknown }> } | undefined
              const entries = appended.result as ReadonlyArray<OutboxEntry>
              // Only the last operation is ever rewritten, so the last row is the latest.
              const latest = entries[entries.length - 1]
              const replaced = new Set(entries.map(entry => entry.localSequence))
              resolve(
                saved === undefined || latest === undefined
                  ? saved
                  : {
                      ...saved,
                      revision: latest.revision,
                      nextLocalSequence: latest.nextLocalSequence,
                      pending: [
                        ...saved.pending.filter(
                          operation => !replaced.has(operation.localSequence as number),
                        ),
                        ...entries.map(entry => entry.operation),
                      ],
                    },
              )
            }
            transaction.onabort = () =>
              reject(transaction.error ?? new Error('IndexedDB read aborted'))
          }),
        catch: cause => storageError('Could not read the replica', cause),
      }),
    save: (state, expectedRevision) =>
      Effect.tryPromise({
        try: () =>
          write(expectedRevision, (replica, outbox) => {
            replica.put(state, 'state')
            replica.put((state as { revision: number }).revision, 'revision')
            outbox.clear()
          }),
        catch: cause => storageError('Could not save the replica', cause),
      }),
    append: (entry, expectedRevision) =>
      Effect.tryPromise({
        try: () =>
          write(expectedRevision, (replica, outbox) => {
            outbox.put(entry, entry.localSequence)
            replica.put(entry.revision, 'revision')
          }),
        catch: cause => storageError('Could not save the replica', cause),
      }),
    close: Effect.sync(() => database.close()),
  }
  return storage
})

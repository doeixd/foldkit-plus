/**
 * A durable Message whose Schema changed between two builds: version 1 had
 * a `title`, version 2 calls it `name` and refuses an empty one. What the old
 * build stored, in an outbox or in the journal, is read by the new build
 * through the history; what nothing reads is refused by its id or stops the
 * document, typed, and nothing is dropped.
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { IDBFactory } from 'fake-indexeddb'
import { Effect, Exit, Match, Option, Schema, Scope } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { ActorId, DocumentId as JournalDocumentId, Journal, OpId } from 'foldkit-durable'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { afterEach, describe, expect, it } from 'vitest'
import {
  StorageError,
  Sync,
  SyncRefusal,
  documentId,
  localSequence,
  opId,
  replicaId,
  sequence,
  type AuthorizeDecision,
  type Migrations,
  type Operation,
  type Replica as Replica_,
  type Storage,
  type TransportClient,
  type WrittenOperation,
} from '../src/index.js'
import { journalExchange } from '../src/journal.js'
import { memoryStorage } from './memoryStorage.js'

const Cleared = Schema.TaggedStruct('Cleared', {})
const RenamedV1 = Schema.TaggedStruct('Renamed', { title: Schema.String })
const NoteMessageV1 = Schema.Union([RenamedV1, Cleared])
const Renamed = Schema.TaggedStruct('Renamed', { name: Schema.NonEmptyString })
const NoteMessage = Schema.Union([Renamed, Cleared])

const NoteHistory = Sync.migrations(NoteMessageV1).next(NoteMessage, previous =>
  Match.valueTags(previous, {
    Renamed: ({ title }) => ({ _tag: 'Renamed' as const, name: title }),
    Cleared: cleared => cleared,
  }),
)

const Shared = Schema.Struct({ names: Schema.Array(Schema.String) })
const shared = { shared: Shared, empty: { names: [] }, durable: () => true }
const key = documentId('note')

/** The build before the change: version 1 is its only Message. */
const OldNote = Sync.define({
  documentId: key,
  message: NoteMessageV1,
  ...shared,
  replay: (state, message) =>
    Match.valueTags(message, {
      Renamed: ({ title }) => ({ names: [...state.names, title] }),
      Cleared: () => ({ names: [] }),
    }),
})

/** The build after it: the history, ending at version 2. */
const NewNote = Sync.define({
  documentId: key,
  migrations: NoteHistory,
  ...shared,
  replay: (state, message) =>
    Match.valueTags(message, {
      Renamed: ({ name }) => ({ names: [...state.names, name] }),
      Cleared: () => ({ names: [] }),
    }),
})

type Contract = typeof OldNote | typeof NewNote

const scopes: Array<Scope.Closeable> = []
const folders: Array<string> = []
afterEach(() => {
  for (const scope of scopes.splice(0)) Effect.runSync(Scope.close(scope, Exit.void))
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/** A journal file both builds open in turn, as one server across a deploy. */
const journalFile = (): string => {
  const folder = mkdtempSync(join(tmpdir(), 'upcasting-'))
  folders.push(folder)
  return join(folder, 'note.sqlite')
}

const openJournal = (
  sync: Contract,
  file: string,
  more: {
    readonly authorize?: (operation: Operation) => AuthorizeDecision
    readonly stamp?: true
  } = {},
) => {
  const scope = Effect.runSync(Scope.make())
  scopes.push(scope)
  const contract = sync.journalContract()
  return Effect.runSync(
    Journal.make<Operation, typeof Shared.Type, string>({
      ...contract,
      file,
      opId: operation => OpId.make(operation.opId),
      actorId: principal => ActorId.make(principal),
      ...(more.authorize === undefined
        ? {}
        : { authorize: ({ operation }) => more.authorize!(operation) }),
      ...(more.stamp === undefined
        ? {}
        : {
            stamp: (operation: Operation) => ({
              ...operation,
              message: { ...(operation.message as object), name: 'stamped' },
            }),
          }),
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
}

type Note = typeof Shared.Type
type Replica = Replica_<unknown, Note>

const open = <M>(sync: Sync<M, Note>, storage: Storage) =>
  Effect.runPromise(sync.openReplica(storage, { replicaId: replicaId('a') }))

/** A storage that outlives its replica, as a tab's IndexedDB outlives a deploy. */
const keptStorage = (): Storage => {
  const storage = memoryStorage()
  return { ...storage, close: Effect.void }
}

const synchronize = (replica: Replica, client: TransportClient) =>
  Effect.runPromise(
    Effect.exit(replica.synchronize.pipe(Effect.provide(Sync.transport.fromPromise(client)))),
  )

/** What a replica would send, held back. */
const held = async (replica: Replica): Promise<ReadonlyArray<unknown>> => {
  let sent: ReadonlyArray<unknown> = []
  await synchronize(replica, {
    exchange: async (_, pending) => {
      sent = pending
      throw new Error('held')
    },
  })
  return sent
}

const old = (title: string) => RenamedV1.make({ title })

describe('an outbox written by the old build', () => {
  it('opens under the new one, replays upcast, and commits to a journal that has both', async () => {
    const storage = keptStorage()
    const before = await open(OldNote, storage)
    await Effect.runPromise(before.submit(old('Groceries')))

    const after = await open(NewNote, storage)
    // Kept as written: the outbox and what is sent hold version 1.
    expect(await Effect.runPromise(after.pending)).toEqual([
      expect.objectContaining({ message: { _tag: 'Renamed', title: 'Groceries' } }),
    ])
    expect(await Effect.runPromise(after.shared)).toEqual({ names: ['Groceries'] })

    const journal = openJournal(NewNote, ':memory:')
    expect(
      Exit.isSuccess(
        await synchronize(after, journalExchange({ sync: NewNote, journal, principal: 'ada' })),
      ),
    ).toBe(true)
    expect(await Effect.runPromise(after.status)).toMatchObject({ pending: 0, rejected: [] })
    expect(await Effect.runPromise(after.committed)).toEqual({ names: ['Groceries'] })
  })

  it('moves an operation no step reads to refused, keeps its payload, and sends the rest', async () => {
    const storage = keptStorage()
    const before = await open(OldNote, storage)
    // Version 1 took an empty title; version 2 refuses an empty name.
    await Effect.runPromise(before.submit(old('')))
    await Effect.runPromise(before.submit(old('Eggs')))

    const after = await open(NewNote, storage)
    const status = await Effect.runPromise(after.status)
    expect(status.pending).toBe(1)
    expect(status.refused).toEqual([
      expect.objectContaining({ opId: 'a:1', message: { _tag: 'Renamed', title: '' } }),
    ])
    const journal = openJournal(NewNote, ':memory:')
    await synchronize(after, journalExchange({ sync: NewNote, journal, principal: 'ada' }))
    expect(await Effect.runPromise(after.committed)).toEqual({ names: ['Eggs'] })

    // The refusal was written, so it is still there after a reload, until dismissed.
    const reloaded = await open(NewNote, storage)
    expect((await Effect.runPromise(reloaded.status)).refused.map(({ opId }) => opId)).toEqual([
      'a:1',
    ])
    await Effect.runPromise(reloaded.dismiss(opId('a:1')))
    expect((await Effect.runPromise(reloaded.status)).refused).toEqual([])
    const again = await open(NewNote, storage)
    expect((await Effect.runPromise(again.status)).refused).toEqual([])
  })

  it('writes the refusal under the revision it loaded, so a second writer fails it', async () => {
    const storage = keptStorage()
    const before = await open(OldNote, storage)
    await Effect.runPromise(before.submit(old('')))
    const saves: Array<number | null> = []
    const watched: Storage = {
      ...storage,
      save: (state, expected) => {
        saves.push(expected)
        return storage.save(state, expected)
      },
    }
    await open(NewNote, watched)
    // The memory storage ignores the revision; a real store fails a write under
    // any revision but the one it holds, which after one submit is 1.
    expect(saves).toEqual([1])
  })

  it('refuses to open on an operation a newer build wrote, and removes nothing', async () => {
    const storage = keptStorage()
    const newer = await open(NewNote, storage)
    await Effect.runPromise(newer.submit(Renamed.make({ name: 'Groceries' })))
    const exit = await Effect.runPromiseExit(OldNote.openReplica(storage))
    expect(exit).toMatchObject({
      _tag: 'Failure',
      cause: {
        reasons: [{ error: { _tag: 'UnsupportedMessageVersionError', found: 2, supported: 1 } }],
      },
    })
    const reopened = await open(NewNote, storage)
    expect(await Effect.runPromise(reopened.pending)).toHaveLength(1)
  })
})

describe('the wire', () => {
  it('is the same for a document with no migrations as for one with only its first Schema', async () => {
    const plain = await open(OldNote, keptStorage())
    const first = Sync.define({
      documentId: key,
      migrations: Sync.migrations(NoteMessageV1),
      ...shared,
      replay: state => state,
    })
    const chained = await Effect.runPromise(
      first.openReplica(keptStorage(), { replicaId: replicaId('a') }),
    )
    await Effect.runPromise(plain.submit(old('Milk')))
    await Effect.runPromise(chained.submit(old('Milk')))
    const sent = await held(plain)
    expect(JSON.stringify(await held(chained))).toBe(JSON.stringify(sent))
    // Version 1 names no version at all.
    expect(sent[0]).not.toHaveProperty('messageVersion')
  })

  it('names the version past 1, on what is sent and on what the server sends back', async () => {
    const replica = await open(NewNote, keptStorage())
    await Effect.runPromise(replica.submit(Renamed.make({ name: 'Milk' })))
    const [sent] = await held(replica)
    expect(sent).toMatchObject({ messageVersion: 2, message: { name: 'Milk' } })

    const exchange = journalExchange({
      sync: NewNote,
      journal: openJournal(NewNote, ':memory:'),
      principal: 'ada',
    })
    const reply = NewNote.codec.decodeExchange(await exchange.exchange(sequence(0), [sent!]))
    expect(reply.operations).toEqual([
      expect.objectContaining({ messageVersion: 2, message: { _tag: 'Renamed', name: 'Milk' } }),
    ])
  })

  it('reads an explicit version 1 as an absent one', () => {
    const written = {
      protocolVersion: 1,
      schemaVersion: 1,
      documentId: 'note',
      replicaId: 'a',
      localSequence: 1,
      opId: 'a:1',
      baseCursor: 0,
      message: { _tag: 'Renamed', title: 'Milk' },
    }
    const contract = NewNote.journalContract().operation
    expect(contract.compared({ ...written, messageVersion: 1 })).toEqual(contract.compared(written))
    expect(contract.compared(written)).not.toHaveProperty('messageVersion')
    expect(NewNote.codec.normalizeOperation({ ...written, messageVersion: 1 })).toEqual(
      NewNote.codec.normalizeOperation(written),
    )
  })
})

/** What the release before upcasting wrote: `fixtures/previousNote.json` says how. */
const previous = JSON.parse(
  readFileSync(new URL('./fixtures/previousNote.json', import.meta.url), 'utf8'),
) as {
  readonly state: string
  readonly row: { readonly input: string; readonly payloadHash: string }
  readonly exchange: string
}

/** Durable's canonical form: keys sorted, at every depth. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : 1)))
      : inner,
  )

describe('the release before', () => {
  it('saves the replica state it saved, byte for byte, for a document with no migrations', async () => {
    let saved = ''
    const storage: Storage = {
      ...keptStorage(),
      save: state => Effect.sync(() => void (saved = JSON.stringify(state))),
    }
    const replica = await open(OldNote, storage)
    await Effect.runPromise(replica.submit(old('Groceries')))
    expect(saved).toBe(previous.state)
  })

  it('stores the journal row it stored, with the same hash', async () => {
    const file = journalFile()
    const journal = openJournal(OldNote, file)
    const [sent] = JSON.parse(previous.state).pending as ReadonlyArray<unknown>
    await Effect.runPromise(
      journal.append(JournalDocumentId.make('note'), OldNote.codec.writtenFrom(sent, key), 'ada'),
    )
    const database = new DatabaseSync(file)
    const row = database.prepare('SELECT input, payload_hash FROM operations').get()
    database.close()
    expect(row).toEqual({ input: previous.row.input, payload_hash: previous.row.payloadHash })
  })

  it('answers an exchange as it answered, byte for byte, for a document with no serverOnly', async () => {
    const Local = Schema.TaggedStruct('Local', {})
    const WithLocal = Sync.define({
      documentId: key,
      message: Schema.Union([RenamedV1, Cleared, Local]),
      ...shared,
      durable: message => message._tag !== 'Local',
      replay: state => state,
    })
    const scope = Effect.runSync(Scope.make())
    scopes.push(scope)
    const journal = Effect.runSync(
      Journal.make<Operation, typeof Shared.Type, string>({
        ...WithLocal.journalContract(),
        file: ':memory:',
        opId: operation => OpId.make(operation.opId),
        actorId: principal => ActorId.make(principal),
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )
    const [sent] = JSON.parse(previous.state).pending as ReadonlyArray<WrittenOperation>
    const local = WithLocal.journalContract().operation.encode({
      ...WithLocal.codec.normalizeOperation(sent),
      localSequence: localSequence(2),
      opId: opId('a:2'),
      message: { _tag: 'Local' },
    })
    const { epoch: _, ...reply } = (await journalExchange({
      sync: WithLocal,
      journal,
      principal: 'ada',
    }).exchange(sequence(0), [sent!, local])) as Record<string, unknown>
    expect(JSON.stringify(reply)).toBe(previous.exchange)
  })

  it('hashes a version-1 operation the new history compares as the old build hashed it', () => {
    const [sent] = JSON.parse(previous.state).pending as ReadonlyArray<unknown>
    const compared = NewNote.journalContract().operation.compared(sent)
    expect(createHash('sha256').update(canonical(compared)).digest('hex')).toBe(
      previous.row.payloadHash,
    )
  })
})

describe('across a deploy', () => {
  it('reads an edit committed by the old build, whose acknowledgement was lost, as committed', async () => {
    const file = journalFile()
    const storage = keptStorage()
    const before = await open(OldNote, storage)
    await Effect.runPromise(before.submit(old('Groceries')))
    const oldServer = journalExchange({
      sync: OldNote,
      journal: openJournal(OldNote, file),
      principal: 'ada',
    })
    // The server commits it; the reply never arrives.
    await synchronize(before, {
      exchange: async (cursor, pending, epoch) => {
        await oldServer.exchange(cursor, pending, epoch)
        throw new Error('connection lost')
      },
    })
    expect((await Effect.runPromise(before.status)).pending).toBe(1)

    // Both sides now run the new build, over the same journal file.
    const after = await open(NewNote, storage)
    const newServer = journalExchange({
      sync: NewNote,
      journal: openJournal(NewNote, file),
      principal: 'ada',
    })
    expect(Exit.isSuccess(await synchronize(after, newServer))).toBe(true)
    const status = await Effect.runPromise(after.status)
    expect(status).toMatchObject({ pending: 0, rejected: [], lastError: undefined })
    // Committed once, and the committed history replays upcast.
    expect(await Effect.runPromise(after.committed)).toEqual({ names: ['Groceries'] })
  })

  it('stamps an old operation and stores it at the current version', async () => {
    const replica = await open(OldNote, keptStorage())
    await Effect.runPromise(replica.submit(old('Groceries')))
    const [sent] = await held(replica)
    const exchange = journalExchange({
      sync: NewNote,
      journal: openJournal(NewNote, ':memory:', { stamp: true }),
      principal: 'ada',
    })
    const raw = (await exchange.exchange(sequence(0), [sent!])) as {
      readonly operations: ReadonlyArray<unknown>
    }
    expect(raw.operations).toEqual([
      expect.objectContaining({
        messageVersion: 2,
        message: { _tag: 'Renamed', name: 'stamped' },
      }),
    ])
  })

  it('fails an exchange from behind a committed row no step reads, typed, and says nothing of it', async () => {
    const file = journalFile()
    const before = await open(OldNote, keptStorage())
    await Effect.runPromise(before.submit(old('')))
    await synchronize(
      before,
      journalExchange({ sync: OldNote, journal: openJournal(OldNote, file), principal: 'ada' }),
    )
    expect((await Effect.runPromise(before.status)).pending).toBe(0)

    const newServer = journalExchange({
      sync: NewNote,
      journal: openJournal(NewNote, file),
      principal: 'ada',
    })
    const failed = newServer.exchange(sequence(0), [])
    await expect(failed).rejects.toMatchObject({
      _tag: 'UnreadableHistoryError',
      documentId: 'note',
      opId: 'a:1',
      version: 1,
    })
    // What a socket sends a replica: not another replica's operation.
    await expect(failed).rejects.toMatchObject({
      message: 'This server cannot read the history of this document',
    })
  })

  it('serves a replica past a committed row no step reads', async () => {
    const file = journalFile()
    const before = await open(OldNote, keptStorage())
    await Effect.runPromise(before.submit(old('')))
    await synchronize(
      before,
      journalExchange({ sync: OldNote, journal: openJournal(OldNote, file), principal: 'ada' }),
    )
    const newServer = journalExchange({
      sync: NewNote,
      journal: openJournal(NewNote, file),
      principal: 'ada',
    })
    // The journal reads no row at or before the cursor it is asked from.
    const reply = NewNote.codec.decodeExchange(await newServer.exchange(sequence(1), []))
    expect(reply).toMatchObject({ operations: [], rejected: [] })
  })

  it('refuses a document, after a rollback, that holds a version the server lacks', async () => {
    const file = journalFile()
    const writer = await open(NewNote, keptStorage())
    await Effect.runPromise(writer.submit(Renamed.make({ name: 'Groceries' })))
    await synchronize(
      writer,
      journalExchange({ sync: NewNote, journal: openJournal(NewNote, file), principal: 'ada' }),
    )
    const rolledBack = journalExchange({
      sync: OldNote,
      journal: openJournal(OldNote, file),
      principal: 'ada',
    })
    await expect(rolledBack.exchange(sequence(0), [])).rejects.toMatchObject({
      _tag: 'UnreadableHistoryError',
      opId: 'a:1',
      version: 2,
    })
  })

  it('refuses a retransmission of a committed operation no step reads as the server’s failure', async () => {
    const file = journalFile()
    const before = await open(OldNote, keptStorage())
    await Effect.runPromise(before.submit(old('')))
    const [sent] = await held(before)
    const oldServer = journalExchange({
      sync: OldNote,
      journal: openJournal(OldNote, file),
      principal: 'ada',
    })
    await oldServer.exchange(sequence(0), [sent!])
    const newServer = journalExchange({
      sync: NewNote,
      journal: openJournal(NewNote, file),
      principal: 'ada',
    })
    // Never "rejected": the edit did commit. Its sender, unacknowledged, reads from 0.
    await expect(newServer.exchange(sequence(0), [sent!])).rejects.toMatchObject({
      _tag: 'UnreadableHistoryError',
      opId: 'a:1',
    })
  })
})

describe('a client and a server of different builds', () => {
  it('a client ahead of its server waits, its edit kept, rather than losing it', async () => {
    const replica = await open(NewNote, keptStorage())
    await Effect.runPromise(replica.submit(Renamed.make({ name: 'Groceries' })))
    const oldServer = journalExchange({
      sync: OldNote,
      journal: openJournal(OldNote, ':memory:'),
      principal: 'ada',
    })
    expect(Exit.isFailure(await synchronize(replica, oldServer))).toBe(true)
    const status = await Effect.runPromise(replica.status)
    expect(status).toMatchObject({ pending: 1, rejected: [] })
    expect(status.lastError).toContain('Message version 2')
  })

  it('a client behind its server fails the exchange typed, and keeps its outbox', async () => {
    const newServer = journalExchange({
      sync: NewNote,
      journal: openJournal(NewNote, ':memory:'),
      principal: 'ada',
    })
    const writer = await open(NewNote, keptStorage())
    await Effect.runPromise(writer.submit(Renamed.make({ name: 'Groceries' })))
    await synchronize(writer, newServer)

    const reader = await Effect.runPromise(
      OldNote.openReplica(keptStorage(), { replicaId: replicaId('b') }),
    )
    await Effect.runPromise(reader.submit(old('Eggs')))
    const exit = await synchronize(reader, newServer)
    expect(exit).toMatchObject({
      _tag: 'Failure',
      cause: { reasons: [{ error: { _tag: 'UnsupportedMessageVersionError', found: 2 } }] },
    })
    expect((await Effect.runPromise(reader.status)).pending).toBe(1)
  })

  it('a server rejects an entry no step reads as Unreadable, and the replica keeps it in refused', async () => {
    const before = await open(OldNote, keptStorage())
    await Effect.runPromise(before.submit(old('')))
    const [sent] = await held(before)
    const exchange = journalExchange({
      sync: NewNote,
      journal: openJournal(NewNote, ':memory:'),
      principal: 'ada',
    })
    const reply = NewNote.codec.decodeExchange(await exchange.exchange(sequence(0), [sent!]))
    expect(reply.refusals).toEqual([{ opId: 'a:1', refusal: { _tag: 'Unreadable', version: 1 } }])

    // The old build's replica, told so by the new server, keeps it as written.
    await synchronize(before, exchange)
    const status = await Effect.runPromise(before.status)
    expect(status.pending).toBe(0)
    expect(status.refused).toEqual([expect.objectContaining({ opId: 'a:1' })])
    expect(status.rejected[0]?.refusal).toEqual(Option.some(SyncRefusal.Unreadable({ version: 1 })))
  })
})

describe('what the replica keeps', () => {
  it('writes nothing to dismiss an id it does not hold', async () => {
    const storage = keptStorage()
    let saves = 0
    const counted: Storage = {
      ...storage,
      save: (state, expected) => {
        saves += 1
        return storage.save(state, expected)
      },
    }
    const replica = await open(NewNote, counted)
    const before = saves
    await Effect.runPromise(replica.dismiss(opId('a:9')))
    expect(saves).toBe(before)
  })

  it('keeps refused through IndexedDB, whose submits are appended rather than saved', async () => {
    const factory = new IDBFactory()
    const storageOf = () => Sync.indexedDb('note', factory)
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const replica = yield* OldNote.openReplica(yield* storageOf(), {
            replicaId: replicaId('a'),
          })
          yield* replica.submit(old(''))
          yield* replica.submit(old('Eggs'))
        }),
      ),
    )
    const reopened = () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const replica = yield* NewNote.openReplica(yield* storageOf())
            const status = yield* replica.status
            return { pending: status.pending, refused: status.refused.map(({ opId }) => opId) }
          }),
        ),
      )
    expect(await reopened()).toEqual({ pending: 1, refused: ['a:1'] })
    // Saved over the appended outbox: a second open finds it moved, not twice.
    expect(await reopened()).toEqual({ pending: 1, refused: ['a:1'] })
  })

  it('fails to open, its outbox intact, when another tab wrote between its read and its refusal', async () => {
    // A store that checks the revision, as IndexedDB does.
    let stored: { readonly revision: number } | undefined
    const store: Storage = {
      load: () => Effect.sync(() => structuredClone(stored)),
      save: (state, expected) =>
        (stored?.revision ?? null) === expected
          ? Effect.sync(() => void (stored = structuredClone(state) as { revision: number }))
          : Effect.fail(new StorageError({ message: 'Replica was changed by another writer' })),
      close: Effect.void,
    }
    const before = await open(OldNote, store)
    await Effect.runPromise(before.submit(old('')))
    const raced: Storage = {
      ...store,
      load: () =>
        Effect.map(store.load(), state => {
          // Another tab's write lands after this tab read the store.
          stored = { ...stored!, revision: stored!.revision + 1 }
          return state
        }),
    }
    const exit = await Effect.runPromiseExit(NewNote.openReplica(raced))
    expect(exit).toMatchObject({
      _tag: 'Failure',
      cause: { reasons: [{ error: { _tag: 'StorageError' } }] },
    })
    expect(stored).toMatchObject({ pending: [expect.objectContaining({ opId: 'a:1' })] })
  })

  it('fails an exchange whose Unreadable refusal names an operation it did not reject', async () => {
    const replica = await open(NewNote, keptStorage())
    await Effect.runPromise(replica.submit(Renamed.make({ name: 'Milk' })))
    const exit = await synchronize(replica, {
      exchange: async () => ({
        operations: [],
        rejected: [],
        refusals: [{ opId: 'a:1', refusal: { _tag: 'Unreadable', version: 1 } }],
      }),
    })
    expect(Exit.isFailure(exit)).toBe(true)
    expect(await Effect.runPromise(replica.status)).toMatchObject({ pending: 1, refused: [] })
  })
})

describe('a server of the old version', () => {
  it('appends nothing of an outbox holding a newer entry after a readable one', async () => {
    const journal = openJournal(OldNote, ':memory:')
    const reader = await Effect.runPromise(
      OldNote.openReplica(keptStorage(), { replicaId: replicaId('b') }),
    )
    await Effect.runPromise(reader.submit(old('Eggs')))
    const [readable] = await held(reader)
    const writer = await open(NewNote, keptStorage())
    await Effect.runPromise(writer.submit(Renamed.make({ name: 'Milk' })))
    const [newer] = await held(writer)
    const exchange = journalExchange({ sync: OldNote, journal, principal: 'ada' })
    await expect(exchange.exchange(sequence(0), [readable!, newer!])).rejects.toMatchObject({
      _tag: 'UnsupportedMessageVersionError',
    })
    expect(Effect.runSync(journal.cursor(JournalDocumentId.make('note')))).toBe(0)
  })
})

describe('a history', () => {
  it('refuses one not made by Sync.migrations', () => {
    const forged: Migrations<typeof NoteMessage.Type, typeof NoteMessage.Encoded> = {
      version: 2,
      current: NoteMessage,
      next: NoteHistory.next,
    }
    expect(() =>
      Sync.define({ documentId: key, migrations: forged, ...shared, replay: state => state }),
    ).toThrow('comes from Sync.migrations')
  })

  it('gives each step its version’s value normalized, the form it is compared by', () => {
    const TrimmedV1 = Schema.TaggedStruct('Renamed', { title: Schema.Trim })
    const Trimmed = Sync.define({
      documentId: key,
      migrations: Sync.migrations(Schema.Union([TrimmedV1, Cleared])).next(NoteMessage, previous =>
        Match.valueTags(previous, {
          Renamed: ({ title }) => ({ _tag: 'Renamed' as const, name: title }),
          Cleared: cleared => cleared,
        }),
      ),
      ...shared,
      replay: state => state,
    })
    const read = Trimmed.codec.normalizeOperation({
      protocolVersion: 1,
      schemaVersion: 1,
      documentId: 'note',
      replicaId: 'a',
      localSequence: 1,
      opId: 'a:1',
      baseCursor: 0,
      message: { _tag: 'Renamed', title: '  Milk ' },
    })
    expect(read.message).toEqual({ _tag: 'Renamed', name: 'Milk' })
  })
})

describe('a step', () => {
  it('reads only what its own version’s Schema reads, before it runs', async () => {
    const replica = await open(OldNote, keptStorage())
    await Effect.runPromise(replica.submit(old('Milk')))
    const [sent] = await held(replica)
    // A field version 1 never had: the step would drop it, but it is not version 1's.
    const tampered = { ...sent!, message: { _tag: 'Renamed', title: 'Milk', extra: true } }
    const exchange = journalExchange({
      sync: NewNote,
      journal: openJournal(NewNote, ':memory:'),
      principal: 'ada',
    })
    const reply = NewNote.codec.decodeExchange(await exchange.exchange(sequence(0), [tampered]))
    expect(reply.refusals).toEqual([{ opId: 'a:1', refusal: { _tag: 'Unreadable', version: 1 } }])
  })
})

describe('a client claiming an old version', () => {
  /** Read as the current Message: an old one read as it is has no `name`, and passes. */
  const refuses = (name: string) => (operation: Operation) =>
    Match.valueTags(Schema.decodeUnknownSync(NoteMessage)(operation.message), {
      Renamed: renamed => renamed.name === name,
      Cleared: () => false,
    })

  it('is refused by admit and authorize exactly as the current Message would be', async () => {
    const asNew = async (name: string) => {
      const replica = await Effect.runPromise(
        NewNote.openReplica(keptStorage(), { replicaId: replicaId(`new-${name}`) }),
      )
      await Effect.runPromise(replica.submit(Renamed.make({ name })))
      // Read as the server reads it, for its id.
      return NewNote.codec.writtenFrom((await held(replica))[0], NewNote.documentId)
    }
    const asOld = async (name: string) => {
      const replica = await Effect.runPromise(
        OldNote.openReplica(keptStorage(), { replicaId: replicaId(`old-${name}`) }),
      )
      await Effect.runPromise(replica.submit(old(name)))
      return NewNote.codec.writtenFrom((await held(replica))[0], NewNote.documentId)
    }
    const exchange = journalExchange({
      sync: NewNote,
      journal: openJournal(NewNote, ':memory:', {
        authorize: operation =>
          refuses('Locked')(operation) ? { allowed: false, reason: 'Locked' } : true,
      }),
      principal: 'ada',
      admit: operation =>
        refuses('Secret')(operation) ? { allowed: false, reason: 'Secret' } : true,
    })
    for (const name of ['Secret', 'Locked']) {
      const current = await asNew(name)
      const claimed = await asOld(name)
      const reply = NewNote.codec.decodeExchange(
        await exchange.exchange(sequence(0), [current, claimed]),
      )
      const forbidden = { _tag: 'Forbidden', reason: name }
      expect(reply.refusals).toEqual([
        { opId: current.opId, refusal: forbidden },
        { opId: claimed.opId, refusal: forbidden },
      ])
      expect(reply.acknowledged).toEqual([])
    }
  })
})

describe('Sync.forApplication(App).make', () => {
  const Model = Schema.Struct({ names: Schema.Array(Schema.String) })
  type Model = typeof Model.Type
  const Message = defineMessageUnion({ Renamed: { name: Schema.String } })
  const App = Surface.application({
    Model,
    Message,
    initial: { names: [] },
    update: (
      model: Model,
      message: typeof Message.Type,
    ): Update.Return<Model, typeof Message.Type> => ({
      model: { names: [...model.names, message.name] },
    }),
  })
  const V1 = Schema.Union([Schema.TaggedStruct('Renamed', { title: Schema.String })])
  const options = {
    documentId: documentId('names'),
    shared: Projection.pick(App.model.names),
    durable: MessageSet.make(App, [Message.Renamed]),
  }

  it('reads the history that ends at the application’s Message', () => {
    const Names = Sync.forApplication(App).make({
      ...options,
      migrations: Sync.migrations(V1).next(App.Message, ({ title }) => ({
        _tag: 'Renamed' as const,
        name: title,
      })),
    })
    expect(Names.codec.messageVersion).toBe(2)
  })

  it('refuses a history whose last Schema is not the application’s Message, however alike', () => {
    const Alike = defineMessageUnion({ Renamed: { name: Schema.String } })
    expect(() =>
      Sync.forApplication(App).make({
        ...options,
        migrations: Sync.migrations(Alike),
      }),
    ).toThrow('must end at the application')
  })
})

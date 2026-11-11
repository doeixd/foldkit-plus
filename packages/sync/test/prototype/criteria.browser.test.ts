/**
 * The acceptance criteria of `effect-reuse-sync-durable-DESIGN.md` §14.2, run
 * on real IndexedDB against Sync's own `indexedDb` storage and against the two
 * prototypes over Effect's browser storage, so a criterion a prototype meets is
 * shown to be one the current storage meets too.
 */
import { Effect, Exit, Schema, Scope } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  defineSync,
  documentId,
  indexedDb,
  layerFromPromise,
  replicaId,
  sequence,
  type CommittedOperation,
  type Operation,
  type Replica,
  type Storage,
  type TransportClient,
} from '../../src/index.js'
import { keyValueStorage, transactionalStorage } from './effectStorage.js'

const Shared = Schema.Struct({ titles: Schema.Array(Schema.String) })
type Shared = typeof Shared.Type
const Message = Schema.Struct({ _tag: Schema.Literal('Added'), title: Schema.String })
type Message = typeof Message.Type

const Sync = defineSync({
  documentId: documentId('list'),
  message: Message,
  shared: Shared,
  empty: { titles: [] },
  durable: () => true,
  replay: (shared, message) => ({ titles: [...shared.titles, message.title] }),
})

const added = (title: string): Message => ({ _tag: 'Added', title })

/** A store as one tab holds it: open until its scope closes, as a reload closes it. */
interface Subject {
  readonly name: string
  readonly open: (database: string) => Effect.Effect<Storage, unknown, Scope.Scope>
  /** How many of two writers from one revision succeed: one is the criterion. */
  readonly raceWinners: number
}

const subjects: ReadonlyArray<Subject> = [
  { name: 'indexedDb (current)', open: database => indexedDb(database), raceWinners: 1 },
  { name: 'typed IndexedDB transaction', open: transactionalStorage, raceWinners: 1 },
  // Every write is its own IndexedDB transaction, so both writers read the old revision.
  { name: 'KeyValueStore', open: keyValueStorage, raceWinners: 2 },
]

let databases = 0
const fresh = (): string => `criteria-${Date.now()}-${(databases += 1)}`

interface Tab {
  readonly storage: Storage
  readonly close: () => Promise<void>
}

const tab = async (subject: Subject, database: string): Promise<Tab> => {
  const scope = await Effect.runPromise(Scope.make())
  const storage = await Effect.runPromise(
    Effect.provideService(subject.open(database), Scope.Scope, scope),
  )
  return {
    storage,
    close: () => Effect.runPromise(Effect.andThen(storage.close, Scope.close(scope, Exit.void))),
  }
}

interface Session {
  readonly replica: Replica<Message, Shared>
  /** Closes the replica and its store, as a reload does. */
  readonly reload: () => Promise<void>
}

const session = async (subject: Subject, database: string): Promise<Session> => {
  const opened = await tab(subject, database)
  const replica = await Effect.runPromise(
    Sync.openReplica(opened.storage, { replicaId: replicaId('a') }),
  )
  return {
    replica,
    reload: async () => {
      await Effect.runPromise(replica.close)
      await opened.close()
    },
  }
}

const submit = (replica: Replica<Message, Shared>, title: string) =>
  Effect.runPromise(replica.submit(added(title)))
const read = <A>(effect: Effect.Effect<A>): A => Effect.runSync(effect)
const synchronize = (replica: Replica<Message, Shared>, transport: TransportClient) =>
  Effect.runPromiseExit(Effect.provide(replica.synchronize, layerFromPromise(transport)))

/**
 * An authoritative log that commits each operation once by its opId, refuses
 * the titles in `refuse`, and serves a checkpoint to a replica behind `floor`.
 */
const server = (options: { readonly refuse?: ReadonlyArray<string> } = {}) => {
  const log: Array<CommittedOperation> = []
  const received: Array<string> = []
  let loseNextAnswer = false
  let floor: { readonly cursor: number; readonly model: Shared } | undefined
  const commit = (operation: Operation, actorId: string) => {
    log.push({ ...operation, serverSequence: sequence(log.length + 1), actorId })
  }
  const transport: TransportClient = {
    exchange: async (cursor, pending) => {
      const rejected: Array<Operation['opId']> = []
      for (const operation of pending) {
        received.push(operation.opId)
        if (log.some(entry => entry.opId === operation.opId)) continue
        if (options.refuse?.includes((operation.message as Message).title))
          rejected.push(operation.opId)
        else commit(operation, 'a')
      }
      if (loseNextAnswer) {
        loseNextAnswer = false
        throw new Error('the answer was lost')
      }
      const checkpoint = floor !== undefined && cursor < floor.cursor ? floor : undefined
      return {
        operations: log.filter(entry => entry.serverSequence > (checkpoint?.cursor ?? cursor)),
        rejected,
        checkpoint,
      }
    },
  }
  return {
    transport,
    log,
    received,
    /** Another replica's operation, committed directly. */
    other: (title: string) =>
      commit(
        {
          protocolVersion: 1,
          schemaVersion: 1,
          documentId: documentId('list'),
          replicaId: replicaId('b'),
          localSequence: log.length + 1,
          opId: `b:${log.length + 1}`,
          baseCursor: sequence(log.length),
          message: added(title),
        } as Operation,
        'b',
      ),
    loseNextAnswer: () => {
      loseNextAnswer = true
    },
    compact: (model: Shared) => {
      floor = { cursor: log.length, model }
    },
  }
}

describe.each(subjects)('§14.2 over $name', subject => {
  it('offline submit persists', async () => {
    const database = fresh()
    const first = await session(subject, database)
    await submit(first.replica, 'milk')
    await submit(first.replica, 'eggs')
    await first.reload()

    const second = await session(subject, database)
    expect(read(second.replica.pending).map(operation => operation.opId)).toEqual(['a:1', 'a:2'])
    await second.reload()
  })

  it('optimistic replay unchanged', async () => {
    const database = fresh()
    const remote = server()
    remote.other('theirs')
    const first = await session(subject, database)
    await synchronize(first.replica, remote.transport)
    await submit(first.replica, 'mine')
    const before = read(first.replica.shared)
    await first.reload()

    const second = await session(subject, database)
    expect(before).toEqual({ titles: ['theirs', 'mine'] })
    expect(read(second.replica.shared)).toEqual(before)
    await second.reload()
  })

  it('reload reconstructs same state', async () => {
    const database = fresh()
    const remote = server()
    remote.other('theirs')
    const first = await session(subject, database)
    await submit(first.replica, 'sent')
    await synchronize(first.replica, remote.transport)
    await submit(first.replica, 'unsent')
    const before = {
      committed: read(first.replica.committed),
      cursor: read(first.replica.cursor),
      pending: read(first.replica.pending),
    }
    await first.reload()

    const second = await session(subject, database)
    expect(before.cursor).toBe(2)
    expect({
      committed: read(second.replica.committed),
      cursor: read(second.replica.cursor),
      pending: read(second.replica.pending),
    }).toEqual(before)
    // The local sequence carries on from where it was, so no opId is reused.
    await submit(second.replica, 'next')
    expect(read(second.replica.pending).map(operation => operation.opId)).toEqual(['a:2', 'a:3'])
    await second.reload()
  })

  it('two tabs cannot share writer revision', async () => {
    const database = fresh()
    const first = await session(subject, database)
    const other = await tab(subject, database)
    const opened = await Effect.runPromise(
      Sync.openReplica(other.storage, { replicaId: replicaId('a') }),
    )
    await submit(first.replica, 'here')

    const refused = await Effect.runPromiseExit(opened.submit(added('there')))
    expect(Exit.isFailure(refused)).toBe(true)
    await Effect.runPromise(opened.close)
    await other.close()
    await first.reload()
  })

  it(`two writers from one revision: ${subject.raceWinners} succeed`, async () => {
    const database = fresh()
    const writers = [await tab(subject, database), await tab(subject, database)]
    const race = (state: { readonly revision: number }, expected: number | null) =>
      Effect.runPromise(
        Effect.all(
          writers.map(writer => Effect.result(writer.storage.save(state, expected))),
          { concurrency: 'unbounded' },
        ),
      ).then(results => results.filter(result => result._tag === 'Success').length)

    // Creating the first state, then replacing it.
    expect(await race({ revision: 0 }, null)).toBe(subject.raceWinners)
    expect(await race({ revision: 1 }, 0)).toBe(subject.raceWinners)
    for (const writer of writers) await writer.close()
  })

  it('server rejection drops operation and rebases', async () => {
    const database = fresh()
    const remote = server({ refuse: ['refused'] })
    remote.other('theirs')
    const first = await session(subject, database)
    await submit(first.replica, 'refused')
    await submit(first.replica, 'kept')
    expect(read(first.replica.shared)).toEqual({ titles: ['refused', 'kept'] })
    await synchronize(first.replica, remote.transport)
    await first.reload()

    const second = await session(subject, database)
    expect(read(second.replica.pending)).toEqual([])
    expect(read(second.replica.shared)).toEqual({ titles: ['theirs', 'kept'] })
    await second.reload()
  })

  it('lost acknowledgement retries same operation', async () => {
    const database = fresh()
    const remote = server()
    const first = await session(subject, database)
    await submit(first.replica, 'once')
    remote.loseNextAnswer()
    expect(Exit.isFailure(await synchronize(first.replica, remote.transport))).toBe(true)
    await first.reload()

    const second = await session(subject, database)
    expect(read(second.replica.pending).map(operation => operation.opId)).toEqual(['a:1'])
    await synchronize(second.replica, remote.transport)
    expect(remote.received).toEqual(['a:1', 'a:1'])
    expect(remote.log.map(entry => entry.opId)).toEqual(['a:1'])
    expect(read(second.replica.shared)).toEqual({ titles: ['once'] })
    expect(read(second.replica.pending)).toEqual([])
    await second.reload()
  })

  it('checkpoint adoption unchanged', async () => {
    const database = fresh()
    const remote = server()
    remote.other('one')
    remote.other('two')
    remote.compact({ titles: ['compacted'] })
    const first = await session(subject, database)
    await submit(first.replica, 'mine')
    await synchronize(first.replica, remote.transport)
    await submit(first.replica, 'later')
    await first.reload()

    const second = await session(subject, database)
    expect(read(second.replica.cursor)).toBe(3)
    expect(read(second.replica.committed)).toEqual({ titles: ['compacted', 'mine'] })
    expect(read(second.replica.shared)).toEqual({ titles: ['compacted', 'mine', 'later'] })
    await second.reload()
  })
})

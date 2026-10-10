/**
 * The journal checks what a client sends, whatever the client checked: an
 * operation whose change breaks the Product's own rules is refused, and the
 * table keeps the value it had.
 */
import { Effect } from 'effect'
import { DocumentId, ReplicaId, Sequence, Sync, type Operation, type Storage } from 'foldkit-sync'
import { expect, test } from 'vitest'
import { Message } from '../src/app.js'
import { type ProductChange, ProductId } from '../src/domain.js'
import { memoryJournal } from '../src/journalNode.js'
import { openServer, productId, seedOf } from '../src/server.js'
import { memorySqlite } from '../src/sqliteNode.js'
import { RegistrySync } from '../src/sync.js'

const memoryStorage = (): Storage => {
  let stored: unknown
  return {
    load: () => Effect.sync(() => stored),
    save: next => Effect.sync(() => (stored = structuredClone(next))),
    close: Effect.void,
  }
}

test('an operation whose price breaks the Product’s rules is refused, and nothing is written', async () => {
  const backend = openServer(memorySqlite(), { count: 10 })
  const journal = memoryJournal(backend)
  const replica = await Effect.runPromise(
    RegistrySync.openReplica(ReplicaId.make('tampering'), memoryStorage()),
  )
  await Effect.runPromise(
    replica.submit(
      Message.EditedProducts({
        changes: [{ id: ProductId.make(productId(1)), member: 'cents', value: 5 }],
      }),
    ),
  )
  // The operation as the replica sends it, held back.
  let sent: ReadonlyArray<Operation> = []
  await Effect.runPromise(
    replica.synchronize.pipe(
      Effect.provide(
        Sync.transport.fromPromise({
          exchange: async (_, pending) => {
            sent = pending
            throw new Error('held')
          },
        }),
      ),
      Effect.ignore,
    ),
  )
  const [operation] = sent
  // A client that skipped its checks: a negative number of cents.
  const tampered = {
    ...operation!,
    message: {
      _tag: 'EditedProducts',
      changes: [{ id: productId(1), description: null, cents: -5 }],
    },
  }
  const reply = await journal.transport.exchange(Sequence.make(0), [tampered])
  expect(reply).toMatchObject({ rejected: [operation!.opId], acknowledged: [] })
  expect(backend.row(productId(1))).toMatchObject({ cents: seedOf(1).cents })

  // One naming another document is refused by the journal's own checks.
  const elsewhere = await journal.transport.exchange(Sequence.make(0), [
    { ...operation!, documentId: DocumentId.make('another-document') },
  ])
  expect(elsewhere).toMatchObject({ rejected: [operation!.opId], acknowledged: [] })

  // The same operation untampered is taken.
  const taken = await journal.transport.exchange(Sequence.make(0), [operation!])
  expect(taken).toMatchObject({ acknowledged: [operation!.opId] })
  expect(backend.row(productId(1))).toMatchObject({ cents: 5 })
})

test('the table only moves forward, so recovery may write an edit again', async () => {
  const backend = openServer(memorySqlite(), { count: 10 })
  const price = (cents: number): ProductChange => ({
    id: ProductId.make(productId(1)),
    member: 'cents',
    value: cents,
  })
  await Effect.runPromise(backend.apply(price(500), 5))
  // An older edit run again after a newer one, as recovery may: nothing changes.
  await Effect.runPromise(backend.apply(price(300), 3))
  expect(backend.row(productId(1))).toMatchObject({ cents: 500, revision: 5 })
  // A second change to the product in the same operation is written too.
  await Effect.runPromise(
    backend.apply({ id: ProductId.make(productId(1)), member: 'description', value: 'Renamed' }, 5),
  )
  expect(backend.row(productId(1))).toMatchObject({
    description: 'Renamed',
    cents: 500,
    revision: 5,
  })
  expect(backend.row(productId(2))).toMatchObject({ cents: seedOf(2).cents, revision: 0 })
})

/** Edits `prices` (product index to cents) from a replica of its own, and exchanges. */
const editAndSend = async (
  journal: ReturnType<typeof memoryJournal>,
  name: string,
  prices: ReadonlyArray<readonly [number, number]>,
) => {
  const replica = await Effect.runPromise(
    RegistrySync.openReplica(ReplicaId.make(name), memoryStorage()),
  )
  for (const [index, cents] of prices)
    await Effect.runPromise(
      replica.submit(
        Message.EditedProducts({
          changes: [{ id: ProductId.make(productId(index)), member: 'cents', value: cents }],
        }),
      ),
    )
  const transport = Sync.transport.fromPromise(journal.transport)
  await Effect.runPromise(replica.synchronize.pipe(Effect.provide(transport)))
  return { replica, transport }
}

test('absorbing records what the table holds, so replicas drop it and newcomers start small', async () => {
  const backend = openServer(memorySqlite(), { count: 10 })
  const journal = memoryJournal(backend)
  const { replica, transport } = await editAndSend(journal, 'editing', [
    [1, 101],
    [2, 202],
  ])
  // Committed, and written by the next exchange's recovery.
  await Effect.runPromise(replica.synchronize.pipe(Effect.provide(transport)))
  expect(backend.row(productId(2))).toMatchObject({ cents: 202, revision: 2 })
  expect((await Effect.runPromise(replica.shared)).edits).toHaveLength(2)

  await Effect.runPromise(journal.absorb)
  await Effect.runPromise(replica.synchronize.pipe(Effect.provide(transport)))
  expect((await Effect.runPromise(replica.shared)).edits).toEqual([])
  const cursor = (await Effect.runPromise(replica.status)).cursor
  // Nothing left to record: a second absorb appends nothing.
  await Effect.runPromise(journal.absorb)
  await Effect.runPromise(replica.synchronize.pipe(Effect.provide(transport)))
  expect((await Effect.runPromise(replica.status)).cursor).toBe(cursor)

  // The log is compacted through what the table holds: an exchange from the
  // start is answered with the snapshot, not the edits behind it.
  expect(await journal.transport.exchange(Sequence.make(0), [])).toMatchObject({
    checkpoint: { model: { edits: [] } },
  })
  // A replica that never saw the log is sent the compacted snapshot: no edits.
  const newcomer = await Effect.runPromise(
    RegistrySync.openReplica(ReplicaId.make('newcomer'), memoryStorage()),
  )
  await Effect.runPromise(newcomer.synchronize.pipe(Effect.provide(transport)))
  expect(await Effect.runPromise(newcomer.committed)).toEqual({ edits: [] })
  expect((await Effect.runPromise(newcomer.status)).cursor).toBe(cursor)
})

test('an edit committed after the table was last written is kept by absorbing', async () => {
  const backend = openServer(memorySqlite(), { count: 10 })
  let writable = true
  const journal = memoryJournal({
    ...backend,
    apply: (change, at) =>
      writable ? backend.apply(change, at) : Effect.fail(new Error('the table cannot be written')),
  })
  const { replica, transport } = await editAndSend(journal, 'editing', [[1, 101]])
  await Effect.runPromise(replica.synchronize.pipe(Effect.provide(transport)))
  writable = false
  await editAndSend(journal, 'later', [[2, 202]])
  await Effect.runPromise(journal.absorb)
  await Effect.runPromise(replica.synchronize.pipe(Effect.provide(transport)))
  // The first is in the table and gone; the second is not written yet and stays.
  expect(
    (await Effect.runPromise(replica.shared)).edits.map(edit => [edit.id, edit.member, edit.value]),
  ).toEqual([[productId(2), 'cents', 202]])
})

test('a client cannot record what the table holds', async () => {
  const backend = openServer(memorySqlite(), { count: 10 })
  const journal = memoryJournal(backend)
  const { transport } = await editAndSend(journal, 'editing', [[1, 101]])
  const forger = await Effect.runPromise(
    RegistrySync.openReplica(ReplicaId.make('forger'), memoryStorage()),
  )
  await Effect.runPromise(forger.submit(Message.AbsorbedEdits({ through: 100 })))
  await Effect.runPromise(forger.synchronize.pipe(Effect.provide(transport)))
  expect((await Effect.runPromise(forger.status)).rejected).toHaveLength(1)
  expect((await Effect.runPromise(forger.shared)).edits).toHaveLength(1)
})

test('an edit to a product the table has not got is refused, and the edits beside it go', async () => {
  const backend = openServer(memorySqlite(), { count: 10 })
  const journal = memoryJournal(backend)
  // Product 50 is past the ten the table holds; product 3 is one of them.
  const { replica } = await editAndSend(journal, 'editing', [
    [50, 5_000],
    [3, 303],
  ])
  const status = await Effect.runPromise(replica.status)
  expect(status.rejected).toHaveLength(1)
  expect(status.pending).toBe(0)
  expect(backend.row(productId(3))).toMatchObject({ cents: 303 })
})

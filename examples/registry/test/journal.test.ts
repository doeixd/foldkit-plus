/**
 * The journal checks what a client sends, whatever the client checked: an
 * operation whose change breaks the Product's own rules is refused, and the
 * table keeps the value it had.
 */
import { Effect, Option } from 'effect'
import { DocumentId, ReplicaId, Sequence, Sync, type Operation, type Storage } from 'foldkit-sync'
import { expect, test } from 'vitest'
import { Message } from '../src/app.js'
import { ProductId } from '../src/domain.js'
import { openJournal } from '../src/journal.js'
import { openServer, productId, seedOf } from '../src/server.js'
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
  const backend = openServer({ count: 10 })
  const journal = openJournal(backend.apply)
  const replica = await Effect.runPromise(
    RegistrySync.openReplica(ReplicaId.make('tampering'), memoryStorage()),
  )
  await Effect.runPromise(
    replica.submit(
      Message.EditedProducts({
        changes: [
          { id: ProductId.make(productId(1)), description: Option.none(), cents: Option.some(5) },
        ],
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

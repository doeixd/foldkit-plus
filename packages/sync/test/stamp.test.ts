/**
 * A commit stamp over a `foldkit-durable` journal: the server writes what its
 * commit decided into a durable Message, and every replica replays the
 * stamped Message in place of the one it sent.
 */
import { Effect, Exit, Schema, Scope } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { ActorId, Journal, OpId } from 'foldkit-durable'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { afterEach, expect, it } from 'vitest'
import { Sync, documentId, replicaId, type Operation, type StampPolicy } from '../src/index.js'
import { journalExchange } from '../src/journal.js'
import { memoryStorage } from './memoryStorage.js'

const Note = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  // Absent on what a client sends; the server's sequence once committed.
  at: Schema.optionalKey(Schema.Number),
})
const Model = Schema.Struct({ notes: Schema.Array(Note) })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  Noted: Note.fields,
  Kept: { id: Schema.String, text: Schema.String },
})
type Message = typeof Message.Type
const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    Noted: ({ id, text, at }) => ({
      model: { notes: [...model.notes, at === undefined ? { id, text } : { id, text, at }] },
    }),
    Kept: ({ id, text }) => ({ model: { notes: [...model.notes, { id, text }] } }),
  })
const App = Surface.application({ Model, Message, initial: { notes: [] }, update })
type Durable = readonly [typeof Message.Noted, typeof Message.Kept]

const notesWith = (stamp: StampPolicy<Durable>) =>
  Sync.forApplication(App).make({
    documentId: documentId('notes'),
    shared: Projection.pick(App.model.notes),
    durable: MessageSet.make(App, [Message.Noted, Message.Kept]),
    stamp,
  })
const Notes = notesWith({
  Noted: ({ id, text }, { sequence }) => Message.Noted({ id, text, at: sequence }),
})

const scopes: Array<Scope.Closeable> = []
afterEach(() => {
  for (const scope of scopes.splice(0)) Effect.runSync(Scope.close(scope, Exit.void))
})

const serve = (sync: typeof Notes) => {
  const scope = Effect.runSync(Scope.make())
  scopes.push(scope)
  const journal = Effect.runSync(
    Journal.make<Operation, { readonly notes: ReadonlyArray<typeof Note.Type> }, string>({
      ...sync.journalContract(),
      file: ':memory:',
      opId: operation => OpId.make(operation.opId),
      actorId: principal => ActorId.make(principal),
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
  return Sync.transport.fromPromise(journalExchange({ sync, journal, principal: 'owner' }))
}

const open = (sync: typeof Notes, name: string) =>
  Effect.runPromise(sync.openReplica(replicaId(name), memoryStorage()))

it('replaces what a replica sent with the stamped Message, the same on every replica', async () => {
  const transport = serve(Notes)
  const ada = await open(Notes, 'ada')
  const ben = await open(Notes, 'ben')
  await Effect.runPromise(ada.submit(Message.Noted({ id: 'n1', text: 'milk' })))
  // Before the exchange, the replica shows what it sent.
  expect(await Effect.runPromise(ada.shared)).toEqual({ notes: [{ id: 'n1', text: 'milk' }] })

  await Effect.runPromise(ada.synchronize.pipe(Effect.provide(transport)))
  await Effect.runPromise(ben.synchronize.pipe(Effect.provide(transport)))
  const stamped = { notes: [{ id: 'n1', text: 'milk', at: 1 }] }
  expect(await Effect.runPromise(ada.committed)).toEqual(stamped)
  expect(await Effect.runPromise(ada.shared)).toEqual(stamped)
  expect(await Effect.runPromise(ada.pending)).toEqual([])
  expect(await Effect.runPromise(ben.shared)).toEqual(stamped)
})

it('commits a variant with no stamp as it was sent', async () => {
  const transport = serve(Notes)
  const ada = await open(Notes, 'ada')
  await Effect.runPromise(ada.submit(Message.Noted({ id: 'n1', text: 'milk' })))
  await Effect.runPromise(ada.submit(Message.Kept({ id: 'n2', text: 'eggs' })))
  await Effect.runPromise(ada.synchronize.pipe(Effect.provide(transport)))
  expect(await Effect.runPromise(ada.committed)).toEqual({
    notes: [
      { id: 'n1', text: 'milk', at: 1 },
      { id: 'n2', text: 'eggs' },
    ],
  })
})

it('rejects, by its id, an operation whose stamp returns another variant', async () => {
  const Turning = notesWith({
    // @ts-expect-error A stamp returns the variant it was given.
    Noted: ({ id, text }) => Message.Kept({ id, text }),
  })
  const transport = serve(Turning)
  const ada = await open(Turning, 'ada')
  await Effect.runPromise(ada.submit(Message.Noted({ id: 'n1', text: 'milk' })))
  await Effect.runPromise(ada.synchronize.pipe(Effect.provide(transport)))
  expect(await Effect.runPromise(ada.committed)).toEqual({ notes: [] })
  expect((await Effect.runPromise(ada.status)).rejected).toHaveLength(1)
})

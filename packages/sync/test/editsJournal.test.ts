/**
 * `editsJournal`: the table as the journal's read model. Each committed edit
 * is applied once, with its sequence; a server started again over a journal
 * that was compacted recovers from the floor rather than ask for what is
 * gone; an operation sent again after a reset is applied again; and two
 * absorbs at once record the table's progress once.
 */
import { Effect, Exit, Option, Schema, Scope } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { ActorId, DocumentId, Journal, OpId } from 'foldkit-durable'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { afterEach, expect, it } from 'vitest'
import {
  Sync,
  documentId,
  localSequence,
  opId,
  replicaId,
  sequence,
  type Operation,
} from '../src/index.js'
import { editsJournal, journalExchange } from '../src/journal.js'
import { memoryStorage } from './memoryStorage.js'

const Price = Schema.Struct({
  id: Schema.String,
  cents: Schema.Number,
  at: Schema.optionalKey(Schema.Number),
})
const Model = Schema.Struct({ prices: Schema.Array(Price) })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  Priced: Price.fields,
  Absorbed: { through: Schema.Number },
})
type Message = typeof Message.Type
const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    Priced: price => ({ model: { ...model, prices: [...model.prices, price] } }),
    Absorbed: ({ through }) => ({
      model: { prices: model.prices.filter(price => price.at === undefined || price.at > through) },
    }),
  })
const App = Surface.application({ Model, Message, initial: { prices: [] }, update })
const Prices = Sync.forApplication(App).make({
  documentId: documentId('prices'),
  shared: Projection.pick(App.model.prices),
  durable: MessageSet.make(App, [Message.Priced, Message.Absorbed]),
  stamp: { Priced: (price, { sequence }) => Message.Priced({ ...price, at: sequence }) },
})
type Shared = { readonly prices: ReadonlyArray<typeof Price.Type> }
const key = DocumentId.make('prices')
const decode = Schema.decodeUnknownSync(Message)
const encode = Schema.encodeSync(Message)

const scopes: Array<Scope.Closeable> = []
afterEach(() => {
  for (const scope of scopes.splice(0)) Effect.runSync(Scope.close(scope, Exit.void))
})
const openJournal = () => {
  const scope = Effect.runSync(Scope.make())
  scopes.push(scope)
  return Effect.runSync(
    Journal.make<Operation, Shared, string>({
      ...Prices.journalContract(),
      file: ':memory:',
      opId: operation => OpId.make(operation.opId),
      actorId: principal => ActorId.make(principal),
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
}

/** A table that records each write, and editsJournal over `journal` writing to it. */
const tableOver = (journal: ReturnType<typeof openJournal>) => {
  const writes: Array<string> = []
  const edits = editsJournal<Shared, string, typeof Price.Type>({
    documentId: 'prices',
    journal,
    editsOf: operation => {
      const message = decode(operation.message)
      return message._tag === 'Priced'
        ? Option.some({ changes: [message], at: Option.fromUndefinedOr(message.at) })
        : Option.none()
    },
    apply: (price, at) => Effect.sync(() => writes.push(`${price.id}=${price.cents}@${at}`)),
    holdsThrough: (snapshot, through) =>
      snapshot.prices.some(price => price.at !== undefined && price.at <= through),
    absorbed: (through, cursor) => ({
      protocolVersion: 1,
      schemaVersion: 1,
      documentId: documentId('prices'),
      replicaId: replicaId('server'),
      localSequence: localSequence(cursor + 1),
      opId: opId(`server:${cursor + 1}`),
      baseCursor: sequence(cursor),
      message: encode(Message.Absorbed({ through })),
    }),
    server: 'server',
  })
  return { writes, edits }
}

/** A replica's prices, sent to the journal through an exchange that settles the table. */
const send = async (
  journal: ReturnType<typeof openJournal>,
  settle: Effect.Effect<void, unknown>,
  name: string,
  prices: ReadonlyArray<readonly [string, number]>,
) => {
  const replica = await Effect.runPromise(Prices.openReplica(replicaId(name), memoryStorage()))
  for (const [id, cents] of prices)
    await Effect.runPromise(replica.submit(Message.Priced({ id, cents })))
  const transport = Sync.transport.fromPromise(
    journalExchange({ sync: Prices, journal, principal: name, settle }),
  )
  await Effect.runPromise(replica.synchronize.pipe(Effect.provide(transport)))
  return replica
}

it('applies each committed edit once, with the sequence it committed at', async () => {
  const journal = openJournal()
  const { writes, edits } = tableOver(journal)
  await send(journal, edits.settle, 'ada', [
    ['a', 1],
    ['b', 2],
  ])
  await Effect.runPromise(edits.settle)
  expect(writes).toEqual(['a=1@1', 'b=2@2'])
})

it('starts again over a compacted journal from its floor, not from what is gone', async () => {
  const journal = openJournal()
  const first = tableOver(journal)
  await send(journal, first.edits.settle, 'ada', [['a', 1]])
  await Effect.runPromise(first.edits.absorb)
  expect(Effect.runSync(journal.floor(key))).toBe(1)

  // The server restarts over the journal it kept: a new process, nothing settled yet.
  const again = tableOver(journal)
  await send(journal, again.edits.settle, 'ben', [['b', 2]])
  expect(again.writes).toEqual(['b=2@3'])
})

it('applies an operation sent again after a reset, rather than take it as run', async () => {
  const journal = openJournal()
  const { writes, edits } = tableOver(journal)
  await send(journal, edits.settle, 'ada', [['a', 1]])
  Effect.runSync(journal.reset(key))
  // The same replica's same operation, sent to the journal's new history.
  await send(journal, edits.settle, 'ada', [['a', 1]])
  expect(writes).toEqual(['a=1@1', 'a=1@1'])
})

it('records once when asked to absorb twice at once, and not before anything settled', async () => {
  const journal = openJournal()
  const { edits } = tableOver(journal)
  await Effect.runPromise(edits.absorb)
  expect(Effect.runSync(journal.cursor(key))).toBe(0)
  await send(journal, edits.settle, 'ada', [['a', 1]])
  await Effect.runPromise(Effect.all([edits.absorb, edits.absorb], { concurrency: 'unbounded' }))
  // One price, then one record of the table holding it.
  expect(Effect.runSync(journal.cursor(key))).toBe(2)
  expect(Effect.runSync(journal.load(key)).snapshot.prices).toEqual([])
})

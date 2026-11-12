/**
 * What the types refuse about server-only Messages and reactions: a Message
 * in both sets, a replica submitting a server-only one, the server appending
 * a durable one as itself, a reaction of another document, one on a Message
 * that never commits, and an answer outside `appends`.
 */
import { Effect, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import type { Journal } from 'foldkit-durable/core'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { expectTypeOf } from 'vitest'
import { DocumentId, Sync, type Operation, type WrittenOperation } from '../src/index.js'
import { reaction, serverJournal } from '../src/journal.js'

const Order = Schema.Struct({ id: Schema.String, paid: Schema.Boolean })
const Model = Schema.Struct({ orders: Schema.Array(Order), draft: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  TypedDraft: { text: Schema.String },
  PlacedOrder: { id: Schema.String },
  ConfirmedPayment: { id: Schema.String, charge: Schema.String },
  SentReceipt: { id: Schema.String },
})
type Message = typeof Message.Type
const update = (model: Model, _message: Message): Update.Return<Model, Message> => ({ model })
const App = Surface.application({ Model, Message, initial: { orders: [], draft: '' }, update })
const Placed = MessageSet.make(App, [Message.PlacedOrder])
const Confirmed = MessageSet.make(App, [Message.ConfirmedPayment])
const Receipted = MessageSet.make(App, [Message.SentReceipt])

const Orders = Sync.forApplication(App).make({
  documentId: DocumentId.make('orders'),
  shared: Projection.pick(App.model.orders),
  durable: Placed,
  serverOnly: MessageSet.union(Confirmed, Receipted),
})

Sync.forApplication(App).make({
  documentId: DocumentId.make('overlapping'),
  shared: Projection.pick(App.model.orders),
  durable: Placed,
  // @ts-expect-error a Message a replica may submit cannot also be server-only
  serverOnly: MessageSet.union(Placed, Confirmed),
})

// A custom replay sees the server-only Messages too.
Sync.forApplication(App).make({
  documentId: DocumentId.make('replayed'),
  shared: Projection.pick(App.model.orders),
  durable: Placed,
  serverOnly: Confirmed,
  replay: (shared, message) => {
    expectTypeOf(message._tag).toEqualTypeOf<'PlacedOrder' | 'ConfirmedPayment'>()
    return shared
  },
})

// An `authorize` rule may name a server-only tag, and not a local one.
Sync.forApplication(App)
  .withPrincipal<{ readonly actorId: string }>()
  .make({
    documentId: DocumentId.make('authorized'),
    shared: Projection.pick(App.model.orders),
    durable: Placed,
    serverOnly: Confirmed,
    authorize: {
      ConfirmedPayment: ({ principal, message }) =>
        principal.actorId === 'server' && message.charge.length > 0,
      // @ts-expect-error `TypedDraft` never commits, so it has no rule
      TypedDraft: () => true,
    },
  })

declare const replica: Effect.Success<ReturnType<typeof Orders.openReplica>>
void replica.submit(Message.PlacedOrder({ id: 'o1' }))
// @ts-expect-error a server-only Message is not one a replica submits
void replica.submit(Message.ConfirmedPayment({ id: 'o1', charge: 'ch_1' }))

declare const journal: Journal<
  Operation,
  { readonly orders: Model['orders'] },
  { readonly actorId: string },
  WrittenOperation
>
declare const sendReceipt: (order: string, key: string) => Effect.Effect<void, Error, 'Mailer'>

const receipt = reaction(Orders, {
  name: 'receipt',
  on: Confirmed,
  appends: Receipted,
  run: ({ message, key }) =>
    sendReceipt(message.id, key).pipe(Effect.as([Message.SentReceipt({ id: message.id })])),
})

void Effect.gen(function* () {
  const server = yield* serverJournal({
    sync: Orders,
    journal,
    server: { actorId: 'orders-server' },
    reactions: [receipt],
  })
  void server.appendAsServer(Message.ConfirmedPayment({ id: 'o1', charge: 'c' }), { key: 'k' })
  // @ts-expect-error what a replica may submit is not the server's to append as itself
  void server.appendAsServer(Message.PlacedOrder({ id: 'o2' }), { key: 'k' })
  // The handler's services are the run's.
  expectTypeOf(server.react).toEqualTypeOf<
    Effect.Effect<Option.Option<import('effect').Duration.Duration>, never, 'Mailer'>
  >()
})

// With no reactions, running them needs nothing.
void Effect.gen(function* () {
  const server = yield* serverJournal({ sync: Orders, journal, server: { actorId: 's' } })
  expectTypeOf(server.react).toEqualTypeOf<
    Effect.Effect<Option.Option<import('effect').Duration.Duration>, never, never>
  >()
})

const Drafts = Sync.forApplication(App).make({
  documentId: DocumentId.make('drafts'),
  shared: Projection.pick(App.model.draft),
  durable: MessageSet.make(App, [Message.TypedDraft]),
  serverOnly: Receipted,
})
declare const draftsJournal: Journal<
  Operation,
  { readonly draft: string },
  { readonly actorId: string },
  WrittenOperation
>
void serverJournal({
  sync: Drafts,
  journal: draftsJournal,
  server: { actorId: 'drafts-server' },
  // @ts-expect-error a reaction declared for another document
  reactions: [receipt],
})

reaction(Orders, {
  name: 'draft',
  // @ts-expect-error a local-only Message never commits, so nothing reacts to it
  on: MessageSet.make(App, [Message.TypedDraft]),
  run: () => Effect.void,
})

reaction(Orders, {
  name: 'undeclared',
  on: Placed,
  appends: Receipted,
  run: ({ message }) =>
    // @ts-expect-error it may append only what `appends` names
    Effect.succeed([Message.ConfirmedPayment({ id: message.id, charge: 'free' })]),
})

reaction(Orders, {
  name: 'silent',
  on: Placed,
  // @ts-expect-error without `appends` it appends nothing
  run: ({ message }) => Effect.succeed([Message.SentReceipt({ id: message.id })]),
})

reaction(Orders, {
  name: 'durable',
  on: Placed,
  // @ts-expect-error `appends` is server-only Messages, never durable ones
  appends: Placed,
  run: () => Effect.void,
})

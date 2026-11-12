/**
 * Server-only Messages and reactions. A replica can never get a server-only
 * Message into history, by any route it controls; the server appends one
 * under a key that names the fact; and a reaction runs after each commit in
 * order, at least once, from a cursor the journal stores, parking what can
 * never succeed and nothing an outage causes.
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Clock, Duration, Effect, Exit, Fiber, Match, Option, Schema, Scope } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import {
  ActorId,
  Cursor,
  DocumentId as JournalDocumentId,
  Journal,
  JournalError,
  OpId,
  type Journal as JournalShape,
} from 'foldkit-durable'
import { MessageSet, Projection, Surface, type Diagnostic } from 'foldkit-surface'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AmbiguousMessageError,
  ServerOnlyMessageError,
  Sync,
  SyncRefusal,
  documentId,
  localSequence,
  opId,
  replicaId,
  sequence,
  type Operation,
  type Storage,
  type WrittenOperation,
} from '../src/index.js'
import {
  journalExchange,
  reaction,
  serverJournal,
  type ServerJournal,
  type Trigger,
} from '../src/journal.js'
import { memoryStorage } from './memoryStorage.js'

const Order = Schema.Struct({
  id: Schema.String,
  cents: Schema.Number,
  paid: Schema.Boolean,
  receipted: Schema.Boolean,
})
const Model = Schema.Struct({ orders: Schema.Array(Order), draft: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  TypedDraft: { text: Schema.String },
  PlacedOrder: { id: Schema.String, cents: Schema.Number },
  ConfirmedPayment: { id: Schema.String, charge: Schema.String },
  SentReceipt: { id: Schema.String },
})
type Message = typeof Message.Type

const mark = (model: Model, id: string, change: Partial<typeof Order.Type>): Model => ({
  ...model,
  orders: model.orders.map(order => (order.id === id ? { ...order, ...change } : order)),
})
const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    TypedDraft: ({ text }) => ({ model: { ...model, draft: text } }),
    PlacedOrder: ({ id, cents }) => ({
      model: { ...model, orders: [...model.orders, { id, cents, paid: false, receipted: false }] },
    }),
    ConfirmedPayment: ({ id }) => ({ model: mark(model, id, { paid: true }) }),
    SentReceipt: ({ id }) => ({ model: mark(model, id, { receipted: true }) }),
  })
const App = Surface.application({ Model, Message, initial: { orders: [], draft: '' }, update })
const Placed = MessageSet.make(App, [Message.PlacedOrder])
const Confirmed = MessageSet.make(App, [Message.ConfirmedPayment])
const Receipted = MessageSet.make(App, [Message.SentReceipt])

const Orders = Sync.forApplication(App).make({
  documentId: documentId('orders'),
  shared: Projection.pick(App.model.orders),
  durable: Placed,
  serverOnly: MessageSet.union(Confirmed, Receipted),
})
type Shared = Parameters<typeof Orders.replay>[0]
const key = JournalDocumentId.make('orders')
const encode = Schema.encodeSync(Message)
const SERVER = 'orders-server'

const scopes: Array<Scope.Closeable> = []
const folders: Array<string> = []
afterEach(() => {
  for (const scope of scopes.splice(0)) Effect.runSync(Scope.close(scope, Exit.void))
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

const file = (): string => {
  const folder = mkdtempSync(join(tmpdir(), 'server-messages-'))
  folders.push(folder)
  return join(folder, 'orders.sqlite')
}

type OrdersJournal = JournalShape<Operation, Shared, string>

interface Hooks {
  readonly validate?: (operation: Operation) => void
  readonly sync?: typeof Orders | typeof OldOrders
}

const openJournal = (at = ':memory:', hooks: Hooks = {}): OrdersJournal => {
  const scope = Effect.runSync(Scope.make())
  scopes.push(scope)
  const { validate } = hooks
  return Effect.runSync(
    Journal.make<Operation, Shared, string>({
      ...(hooks.sync ?? Orders).journalContract(),
      file: at,
      opId: operation => OpId.make(operation.opId),
      actorId: principal => ActorId.make(principal),
      ...(validate === undefined ? {} : { validate: ({ operation }) => validate(operation) }),
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
}

/** An entry as a replica would send it, written at version 1. */
const entry = (message: Message, replica = 'tab', n = 1): WrittenOperation =>
  Orders.journalContract().operation.encode({
    protocolVersion: 1,
    schemaVersion: 1,
    documentId: documentId('orders'),
    replicaId: replicaId(replica),
    localSequence: localSequence(n),
    opId: opId(`${replica}:${n}`),
    baseCursor: sequence(0),
    message: encode(message),
  })

interface Reply {
  readonly rejected: ReadonlyArray<string>
  readonly acknowledged: ReadonlyArray<string>
  readonly refusals?: ReadonlyArray<{ readonly opId: string; readonly refusal: unknown }>
}

/** Exchanges as a client every hook lets do anything: only Sync's own check can refuse. */
const exchange = async (
  journal: OrdersJournal,
  pending: ReadonlyArray<WrittenOperation>,
  reported: Array<Diagnostic> = [],
): Promise<Reply> =>
  (await journalExchange({
    sync: Orders,
    journal,
    principal: 'ada',
    admit: () => true,
    diagnostics: diagnostic => Effect.sync(() => void reported.push(diagnostic)),
  }).exchange(sequence(0), pending)) as Reply

const tags = (journal: OrdersJournal) =>
  Effect.runPromise(journal.read(key, Cursor.make(0))).then(rows =>
    rows.map(row => (row.operation.message as { readonly _tag: string })._tag),
  )

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)

describe('a server-only Message sent by a replica', () => {
  it('is refused as Forbidden, reported, and the edits beside it commit', async () => {
    const journal = openJournal()
    const reported: Array<Diagnostic> = []
    const reply = await exchange(
      journal,
      [
        entry(Message.PlacedOrder({ id: 'o1', cents: 100 }), 'tab', 1),
        entry(Message.ConfirmedPayment({ id: 'o1', charge: 'forged' }), 'tab', 2),
        entry(Message.PlacedOrder({ id: 'o2', cents: 200 }), 'tab', 3),
      ],
      reported,
    )
    expect(reply.rejected).toEqual(['tab:2'])
    expect(reply.acknowledged).toEqual(['tab:1', 'tab:3'])
    expect(reply.refusals).toEqual([
      {
        opId: 'tab:2',
        refusal: { _tag: 'Forbidden', reason: 'Only the server makes this change' },
      },
    ])
    expect(reported).toEqual([
      expect.objectContaining({ _tag: 'ServerOnlySubmitted', opId: 'tab:2', replicaId: 'tab' }),
    ])
    expect(await tags(journal)).toEqual(['PlacedOrder', 'PlacedOrder'])
  })

  it.each([
    ['writtenFrom', (input: unknown) => Orders.codec.writtenFrom(input, documentId('orders'))],
    ['normalizeOperation', (input: unknown) => Orders.codec.normalizeOperation(input)],
    ['operationFrom', (input: unknown) => Orders.codec.operationFrom(input, documentId('orders'))],
  ])('is refused by %s, and read by the journal’s decode', (_, reader) => {
    const sent = entry(Message.ConfirmedPayment({ id: 'o1', charge: 'c' }))
    expect(() => reader(sent)).toThrow(ServerOnlyMessageError)
    expect(Orders.journalContract().operation.decode(sent).message).toEqual({
      _tag: 'ConfirmedPayment',
      id: 'o1',
      charge: 'c',
    })
  })

  it('is refused under the server’s replica ids, or past 128 characters, and the server’s append still commits', async () => {
    const journal = openJournal()
    const server = await run(serverJournal({ sync: Orders, journal, server: SERVER }))
    const order = Message.PlacedOrder({ id: 'o1', cents: 1 })
    // The id `appendAsServer` will use for this key, claimed first.
    const claimed = `server/k/${sha256('payment/1')}`
    const long = 'x'.repeat(129)
    const reply = await exchange(journal, [
      entry(order, claimed, 1),
      entry(order, 'server/r/receipt/0', 1),
      entry(order, long, 1),
      entry(order, 'x'.repeat(128), 1),
    ])
    expect(reply.rejected).toEqual([`${claimed}:1`, 'server/r/receipt/0:1', `${long}:1`])
    expect(reply.refusals?.map(({ refusal }) => (refusal as { _tag: string })._tag)).toEqual([
      'Invalid',
      'Invalid',
      'Invalid',
    ])
    const appended = await run(
      server.appendAsServer(Message.ConfirmedPayment({ id: 'o1', charge: 'c' }), {
        key: 'payment/1',
      }),
    )
    expect(appended).toMatchObject({ _tag: 'Committed', committed: { opId: `${claimed}:1` } })
  })

  it('reaches a replica in history, which replays it', async () => {
    const journal = openJournal()
    const server = await run(serverJournal({ sync: Orders, journal, server: SERVER }))
    await exchange(journal, [entry(Message.PlacedOrder({ id: 'o1', cents: 1 }))])
    await run(
      server.appendAsServer(Message.ConfirmedPayment({ id: 'o1', charge: 'c' }), { key: 'k' }),
    )
    // Loaded again from the file's rows, not the cache.
    expect((await run(journal.load(key))).snapshot.orders).toEqual([
      { id: 'o1', cents: 1, paid: true, receipted: false },
    ])
    const replica = await run(Orders.openReplica(memoryStorage(), { replicaId: replicaId('b') }))
    await run(
      Effect.provide(
        replica.synchronize,
        Sync.transport.fromPromise(journalExchange({ sync: Orders, journal, principal: 'grace' })),
      ),
    )
    expect(await run(replica.committed)).toEqual({
      orders: [{ id: 'o1', cents: 1, paid: true, receipted: false }],
    })
  })
})

/** The build before: `ConfirmedPayment` was a Message a replica sent. */
const OldOrders = Sync.forApplication(App).make({
  documentId: documentId('orders'),
  shared: Projection.pick(App.model.orders),
  durable: MessageSet.union(Placed, Confirmed),
})

describe('a deploy that moves a variant to serverOnly', () => {
  it('opens an outbox holding one, sends it, and reports its refusal', async () => {
    const stored = memoryStorage()
    const kept: Storage = { ...stored, close: Effect.void }
    const before = await run(OldOrders.openReplica(kept, { replicaId: replicaId('tab') }))
    await run(before.submit(Message.PlacedOrder({ id: 'o1', cents: 1 })))
    await run(before.submit(Message.ConfirmedPayment({ id: 'o1', charge: 'c' })))
    const after = await run(Orders.openReplica(kept, { replicaId: replicaId('tab') }))
    expect((await run(after.status)).pending).toBe(2)
    const journal = openJournal()
    await run(
      Effect.provide(
        after.synchronize,
        Sync.transport.fromPromise(journalExchange({ sync: Orders, journal, principal: 'ada' })),
      ),
    )
    const status = await run(after.status)
    expect(status.pending).toBe(0)
    expect(status.rejected).toEqual([
      expect.objectContaining({
        opId: 'tab:2',
        refusal: Option.some(
          SyncRefusal.Forbidden({ reason: Option.some('Only the server makes this change') }),
        ),
      }),
    ])
    expect(await tags(journal)).toEqual(['PlacedOrder'])
  })
})

describe('an upcast entry', () => {
  const OrderV1 = Schema.Union([
    Schema.TaggedStruct('PlacedOrder', { id: Schema.String, cents: Schema.Number }),
    Schema.TaggedStruct('Paid', { id: Schema.String }),
    Schema.TaggedStruct('Gift', { id: Schema.String }),
  ])
  const History = Sync.migrations(OrderV1).next(App.Message, previous =>
    Match.valueTags(previous, {
      PlacedOrder: order => order,
      Paid: ({ id }) => Message.ConfirmedPayment({ id, charge: 'legacy' }),
      Gift: ({ id }) => Message.PlacedOrder({ id, cents: 0 }),
    }),
  )
  const Upcast = Sync.forApplication(App).make({
    documentId: documentId('orders'),
    shared: Projection.pick(App.model.orders),
    durable: Placed,
    serverOnly: MessageSet.union(Confirmed, Receipted),
    migrations: History,
  })
  /** The build before the history: every variant of version 1 was one a replica sent. */
  const Before = Sync.define({
    documentId: documentId('orders'),
    message: OrderV1,
    shared: Schema.Struct({ n: Schema.Number }),
    empty: { n: 0 },
    durable: () => true,
    replay: state => state,
  })
  const old = (n: number, message: typeof OrderV1.Type): WrittenOperation =>
    Before.journalContract().operation.encode({
      protocolVersion: 1,
      schemaVersion: 1,
      documentId: documentId('orders'),
      replicaId: replicaId('tab'),
      localSequence: localSequence(n),
      opId: opId(`tab:${n}`),
      baseCursor: sequence(0),
      message,
    })

  it('is judged by what it becomes: into a server-only variant is refused, out of one accepted', async () => {
    const scope = Effect.runSync(Scope.make())
    scopes.push(scope)
    const journal = Effect.runSync(
      Journal.make<Operation, Shared, string>({
        ...Upcast.journalContract(),
        file: ':memory:',
        opId: operation => OpId.make(operation.opId),
        actorId: principal => ActorId.make(principal),
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )
    const reply = (await journalExchange({
      sync: Upcast,
      journal,
      principal: 'ada',
    }).exchange(sequence(0), [
      old(1, { _tag: 'Paid', id: 'o1' }),
      old(2, { _tag: 'Gift', id: 'o2' }),
    ])) as Reply
    expect(reply.rejected).toEqual(['tab:1'])
    expect(reply.refusals?.[0]?.refusal).toMatchObject({ _tag: 'Forbidden' })
    expect(reply.acknowledged).toEqual(['tab:2'])
    expect(() => Upcast.codec.normalizeOperation(old(1, { _tag: 'Paid', id: 'o1' }))).toThrow(
      ServerOnlyMessageError,
    )
  })
})

/** What `appendAsServer` hashes a key to. */
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

describe('appendAsServer', () => {
  it('commits once per key, and refuses the key for another Message', async () => {
    const journal = openJournal()
    const server = await run(serverJournal({ sync: Orders, journal, server: SERVER }))
    const paid = Message.ConfirmedPayment({ id: 'o1', charge: 'c' })
    const first = await run(server.appendAsServer(paid, { key: 'evt_1' }))
    const again = await run(server.appendAsServer(paid, { key: 'evt_1' }))
    expect(first).toMatchObject({ _tag: 'Committed' })
    expect(again).toMatchObject({ _tag: 'Committed', committed: { sequence: 1 } })
    const reused = await run(
      Effect.flip(server.appendAsServer(Message.SentReceipt({ id: 'o1' }), { key: 'evt_1' })),
    )
    expect(reused).toMatchObject({ _tag: 'SyncServerKeyReusedError', key: 'evt_1' })
    expect(await tags(journal)).toEqual(['ConfirmedPayment'])
  })

  it('refuses a key past 200 characters, an empty one, and a Message a replica submits', async () => {
    const server = await run(
      serverJournal({ sync: Orders, journal: openJournal(), server: SERVER }),
    )
    const paid = Message.ConfirmedPayment({ id: 'o1', charge: 'c' })
    for (const bad of ['', 'k'.repeat(201)])
      expect(await run(Effect.flip(server.appendAsServer(paid, { key: bad })))).toMatchObject({
        _tag: 'InvalidOperationError',
      })
    expect(await run(server.appendAsServer(paid, { key: 'k'.repeat(200) }))).toMatchObject({
      _tag: 'Committed',
    })
    const placed: Message = Message.PlacedOrder({ id: 'o', cents: 1 })
    // @ts-expect-error a Message a replica submits is not the server's to append
    expect(await run(Effect.flip(server.appendAsServer(placed, { key: 'p' })))).toMatchObject({
      _tag: 'InvalidOperationError',
    })
  })

  it('frees a key the journal refused, so a Message its rules take can use it', async () => {
    const journal = openJournal(':memory:', {
      validate: operation => {
        if ((operation.message as { readonly charge?: string }).charge === 'refused')
          throw new Error('not that charge')
      },
    })
    const server = await run(serverJournal({ sync: Orders, journal, server: SERVER }))
    const refused = await run(
      Effect.flip(
        server.appendAsServer(Message.ConfirmedPayment({ id: 'o1', charge: 'refused' }), {
          key: 'evt_1',
        }),
      ),
    )
    expect(refused._tag).toBe('InvalidOperationError')
    expect(
      await run(
        server.appendAsServer(Message.ConfirmedPayment({ id: 'o1', charge: 'ch_1' }), {
          key: 'evt_1',
        }),
      ),
    ).toMatchObject({ _tag: 'Committed' })
  })

  it('is still once after a deploy adds a migration step', async () => {
    const at = file()
    const paid = Message.ConfirmedPayment({ id: 'o1', charge: 'c' })
    const before = await run(
      serverJournal({ sync: Orders, journal: openJournal(at), server: SERVER }),
    )
    await run(before.appendAsServer(paid, { key: 'evt_1' }))
    // The next build: version 2 of the same union, renaming nothing.
    const Next = Sync.forApplication(App).make({
      documentId: documentId('orders'),
      shared: Projection.pick(App.model.orders),
      durable: Placed,
      serverOnly: MessageSet.union(Confirmed, Receipted),
      migrations: Sync.migrations(App.Message).next(App.Message, message => message),
    })
    const scope = Effect.runSync(Scope.make())
    scopes.push(scope)
    const journal = Effect.runSync(
      Journal.make<Operation, Shared, string>({
        ...Next.journalContract(),
        file: at,
        opId: operation => OpId.make(operation.opId),
        actorId: principal => ActorId.make(principal),
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )
    const after = await run(serverJournal({ sync: Next, journal, server: SERVER }))
    expect(await run(after.appendAsServer(paid, { key: 'evt_1' }))).toMatchObject({
      _tag: 'Committed',
      committed: { sequence: 1 },
    })
    expect((await run(journal.read(key, Cursor.make(0)))).length).toBe(1)
  })

  it('cannot take a reaction’s replica id, whatever the key', async () => {
    const journal = openJournal()
    const server = await run(serverJournal({ sync: Orders, journal, server: SERVER }))
    const result = await run(
      server.appendAsServer(Message.SentReceipt({ id: 'o1' }), { key: 'r/receipt/0' }),
    )
    expect(result).toMatchObject({ _tag: 'Committed' })
    if (result._tag === 'Committed')
      expect(result.committed.operation.replicaId).toMatch(/^server\/k\/[0-9a-f]{64}$/)
  })

  it('meets the first actor’s ids once the server’s actor changes', async () => {
    const journal = openJournal()
    const paid = Message.ConfirmedPayment({ id: 'o1', charge: 'c' })
    const first = await run(serverJournal({ sync: Orders, journal, server: SERVER }))
    await run(first.appendAsServer(paid, { key: 'evt_1' }))
    const renamed = await run(serverJournal({ sync: Orders, journal, server: 'other-server' }))
    // A redelivered fact is the first actor's operation: a conflict, not a second commit.
    expect(await run(Effect.flip(renamed.appendAsServer(paid, { key: 'evt_1' })))).toMatchObject({
      _tag: 'IdentityConflictError',
    })
    expect(await tags(journal)).toEqual(['ConfirmedPayment'])
  })
})

// ---- Reactions ----

type Paid = Extract<Message, { readonly _tag: 'ConfirmedPayment' }>
type ServerOnly = Extract<Message, { readonly _tag: 'ConfirmedPayment' | 'SentReceipt' }>

/** A handler that counts its calls and the keys it was given, and answers a receipt. */
const counting = () => {
  const keys: Array<string> = []
  const messages: Array<Paid> = []
  return {
    keys,
    messages,
    run: (trigger: Trigger<Paid>) =>
      Effect.sync(() => {
        keys.push(trigger.key)
        messages.push(trigger.message)
        return [Message.SentReceipt({ id: trigger.message.id })]
      }),
    /** The same, appending nothing. */
    quiet: (trigger: Trigger<Paid>) =>
      Effect.sync(() => {
        keys.push(trigger.key)
      }),
  }
}

type Receipt = Extract<Message, { readonly _tag: 'SentReceipt' }>

const receiptOf = (
  run: (trigger: Trigger<Paid>) => Effect.Effect<ReadonlyArray<Receipt> | void, unknown>,
  more: {
    readonly attempts?: number
    readonly parkAfter?: Duration.Input
    readonly timeout?: Duration.Input
  } = {},
) => reaction(Orders, { name: 'receipt', on: Confirmed, appends: Receipted, run, ...more })

/** The clock at `ms`, so a test moves time between passes. */
const live = Effect.runSync(Clock.clockWith(Effect.succeed))
const at = (ms: number): Clock.Clock => ({
  currentTimeMillisUnsafe: () => ms,
  currentTimeMillis: Effect.succeed(ms),
  currentTimeNanosUnsafe: () => BigInt(ms) * 1_000_000n,
  currentTimeNanos: Effect.succeed(BigInt(ms) * 1_000_000n),
  monotonicTimeNanosUnsafe: () => live.monotonicTimeNanosUnsafe(),
  monotonicTimeNanos: live.monotonicTimeNanos,
  sleep: duration => live.sleep(duration),
})
const reactAt = (server: ServerJournal<ServerOnly, never>, ms = 0) =>
  run(server.react.pipe(Effect.provideService(Clock.Clock, at(ms))))

const pay = (server: ServerJournal<ServerOnly, never>, id: string) =>
  run(
    server.appendAsServer(Message.ConfirmedPayment({ id, charge: `ch_${id}` }), {
      key: `pay/${id}`,
    }),
  )

const cursorOf = (journal: OrdersJournal, name = 'react/receipt') =>
  run(journal.cursors.settled(key, name)).then(found =>
    Option.map(found, ({ cursor, attempts }) => ({ cursor: Number(cursor), attempts })),
  )

describe('a reaction', () => {
  it('runs on a commit made after it was registered and before its first pass', async () => {
    const journal = openJournal()
    const handler = counting()
    const server = await run(
      serverJournal({ sync: Orders, journal, server: SERVER, reactions: [receiptOf(handler.run)] }),
    )
    await pay(server, 'o1')
    expect(await reactAt(server)).toEqual(Option.none())
    expect(handler.keys).toHaveLength(1)
    expect(handler.keys[0]).toMatch(/^[0-9a-f]{64}$/)
    expect(await tags(journal)).toEqual(['ConfirmedPayment', 'SentReceipt'])
    const rows = await run(journal.read(key, Cursor.make(0)))
    // Named by its trigger's id, never by its place in the order.
    const reply = `server/r/receipt/${sha256(rows[0]!.opId)}/0`
    expect(rows[1]!.operation).toMatchObject({
      replicaId: reply,
      localSequence: 1,
      opId: `${reply}:1`,
      baseCursor: 1,
    })
    // The page was read before its own append, which the next pass passes over.
    expect(await cursorOf(journal)).toEqual(Option.some({ cursor: 1, attempts: 0 }))
    await reactAt(server)
    expect(await cursorOf(journal)).toEqual(Option.some({ cursor: 2, attempts: 0 }))
    expect(handler.keys).toHaveLength(1)
  })

  it('does not run on what committed before it was registered', async () => {
    const journal = openJournal()
    const handler = counting()
    const early = await run(serverJournal({ sync: Orders, journal, server: SERVER }))
    await pay(early, 'o1')
    const server = await run(
      serverJournal({ sync: Orders, journal, server: SERVER, reactions: [receiptOf(handler.run)] }),
    )
    await reactAt(server)
    expect(handler.keys).toHaveLength(0)
  })

  it('runs once per commit across a restart, from the cursor it stored', async () => {
    const path = file()
    const handler = counting()
    const first = await run(
      serverJournal({
        sync: Orders,
        journal: openJournal(path),
        server: SERVER,
        reactions: [receiptOf(handler.run)],
      }),
    )
    await pay(first, 'o1')
    await reactAt(first)
    await reactAt(first)
    // A new process over the same file.
    const journal = openJournal(path)
    const second = await run(
      serverJournal({ sync: Orders, journal, server: SERVER, reactions: [receiptOf(handler.run)] }),
    )
    expect(await cursorOf(journal)).toEqual(Option.some({ cursor: 2, attempts: 0 }))
    await reactAt(second)
    await pay(second, 'o2')
    await reactAt(second)
    expect(handler.messages).toEqual([
      Message.ConfirmedPayment({ id: 'o1', charge: 'ch_o1' }),
      Message.ConfirmedPayment({ id: 'o2', charge: 'ch_o2' }),
    ])
  })

  it('makes no call and no write when nothing is new', async () => {
    const path = file()
    const journal = openJournal(path)
    const handler = counting()
    const server = await run(
      serverJournal({ sync: Orders, journal, server: SERVER, reactions: [receiptOf(handler.run)] }),
    )
    await pay(server, 'o1')
    await reactAt(server)
    await reactAt(server)
    const database = new DatabaseSync(path)
    // Moves whenever another connection commits a write to the file.
    const changes = () =>
      (database.prepare('PRAGMA data_version').get() as { readonly data_version: number })
        .data_version
    const ledger = () => database.prepare('SELECT key, status FROM effects ORDER BY key').all()
    const before = { cursor: await cursorOf(journal), ledger: ledger() }
    const written = changes()
    await reactAt(server)
    expect(changes()).toBe(written)
    expect({ cursor: await cursorOf(journal), ledger: ledger() }).toEqual(before)
    expect(handler.keys).toHaveLength(1)
    database.close()
  })

  it('reads a log longer than a page in pages, storing the cursor after each', async () => {
    const journal = openJournal()
    const handler = counting()
    const quiet = reaction(Orders, { name: 'receipt', on: Confirmed, run: handler.quiet })
    const server = await run(
      serverJournal({ sync: Orders, journal, server: SERVER, reactions: [quiet] }),
    )
    for (let n = 0; n < 150; n++) await pay(server, `o${n}`)
    expect(await reactAt(server)).toEqual(Option.some(expect.anything()))
    expect(await cursorOf(journal)).toEqual(Option.some({ cursor: 100, attempts: 0 }))
    expect(await reactAt(server)).toEqual(Option.none())
    expect(await cursorOf(journal)).toEqual(Option.some({ cursor: 150, attempts: 0 }))
    expect(handler.keys).toHaveLength(150)
  })

  it('shares runsPerPass between reactions, so a busy one starves none', async () => {
    const journal = openJournal()
    const receipts = counting()
    const audits: Array<string> = []
    const audit = reaction(Orders, {
      name: 'audit',
      on: Placed,
      run: ({ key: runKey }) => Effect.sync(() => void audits.push(runKey)),
    })
    const server = await run(
      serverJournal({
        sync: Orders,
        journal,
        server: SERVER,
        reactions: [receiptOf(receipts.quiet), audit],
        runsPerPass: 2,
      }),
    )
    for (const id of ['a', 'b', 'c']) await pay(server, id)
    await exchange(journal, [entry(Message.PlacedOrder({ id: 'p', cents: 1 }))])
    await reactAt(server)
    expect(audits).toHaveLength(1)
    expect(receipts.keys).toHaveLength(1)
  })

  it('follows the journal: runs after each commit it hears of, until interrupted', async () => {
    const journal = openJournal()
    const handler = counting()
    const server = await run(
      serverJournal({ sync: Orders, journal, server: SERVER, reactions: [receiptOf(handler.run)] }),
    )
    const fiber = Effect.runFork(server.follow)
    await pay(server, 'o1')
    await vi.waitFor(() => expect(handler.keys).toHaveLength(1))
    await pay(server, 'o2')
    await vi.waitFor(() => expect(handler.keys).toHaveLength(2))
    await Effect.runPromise(Fiber.interrupt(fiber))
    await pay(server, 'o3')
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(handler.keys).toHaveLength(2)
  })

  it('starts no more runs than runsPerPass, and says to come back at once', async () => {
    const journal = openJournal()
    const handler = counting()
    const server = await run(
      serverJournal({
        sync: Orders,
        journal,
        server: SERVER,
        reactions: [receiptOf(handler.run)],
        runsPerPass: 2,
      }),
    )
    for (const id of ['a', 'b', 'c']) await pay(server, id)
    expect(await reactAt(server)).toEqual(Option.some(expect.anything()))
    expect(handler.keys).toHaveLength(2)
    await reactAt(server)
    expect(handler.keys).toHaveLength(3)
  })

  it('keeps the ledger records of two documents apart where their ids differ by a slash', async () => {
    const keys: Array<string> = []
    const of = (document: string) => {
      const Doc = Sync.forApplication(App).make({
        documentId: documentId(document),
        shared: Projection.pick(App.model.orders),
        durable: Placed,
        serverOnly: MessageSet.union(Confirmed, Receipted),
      })
      return {
        Doc,
        made: reaction(Doc, {
          name: 'receipt',
          on: Confirmed,
          run: trigger => Effect.sync(() => void keys.push(trigger.key)),
        }),
      }
    }
    // `a/b` + `c` and `a` + `b/c` join to the same text with a slash.
    const scope = Effect.runSync(Scope.make())
    scopes.push(scope)
    const journal = Effect.runSync(
      Journal.make<Operation, Shared, string>({
        ...Orders.journalContract(),
        file: ':memory:',
        opId: operation => OpId.make(operation.opId),
        actorId: principal => ActorId.make(principal),
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )
    for (const [document, id] of [
      ['a/b', 'c'],
      ['a', 'b/c'],
    ] as const) {
      const { Doc, made } = of(document)
      const server = await run(
        serverJournal({ sync: Doc, journal, server: SERVER, reactions: [made] }),
      )
      const operation = Doc.journalContract().operation.encode({
        protocolVersion: 1,
        schemaVersion: 1,
        documentId: documentId(document),
        replicaId: replicaId(id),
        localSequence: localSequence(1),
        opId: opId(`${id}:1`),
        baseCursor: sequence(0),
        message: encode(Message.ConfirmedPayment({ id: 'o', charge: 'c' })),
      })
      await run(journal.append(JournalDocumentId.make(document), operation, SERVER))
      await reactAt(server)
    }
    expect(keys).toHaveLength(2)
    expect(new Set(keys).size).toBe(2)
  })
})

describe('a reaction that fails', () => {
  const failing = (times: number, how: 'fail' | 'die' | 'hang' = 'fail') => {
    let calls = 0
    const failure = {
      fail: Effect.fail(new Error('the mailer is down')),
      die: Effect.die(new Error('a bug')),
      hang: Effect.never,
    }[how]
    return {
      calls: () => calls,
      run: (trigger: Trigger<Paid>) =>
        Effect.suspend(() => {
          calls += 1
          return calls > times
            ? Effect.succeed([Message.SentReceipt({ id: trigger.message.id })])
            : failure
        }),
    }
  }

  it.each(['fail', 'die', 'hang'] as const)(
    'waits on a backoff the store keeps when it %ss, blocking only its own reaction',
    async how => {
      const path = file()
      const handler = failing(1, how)
      const other = counting()
      const reported: Array<Diagnostic> = []
      const make = (journal: OrdersJournal) =>
        run(
          serverJournal({
            sync: Orders,
            journal,
            server: SERVER,
            reactions: [
              receiptOf(handler.run, { timeout: '30 millis' }),
              reaction(Orders, { name: 'audit', on: Confirmed, run: other.quiet }),
            ],
            diagnostics: diagnostic => Effect.sync(() => void reported.push(diagnostic)),
          }),
        )
      const server = await make(openJournal(path))
      await pay(server, 'o1')
      const wait = await reactAt(server, 1_000)
      expect(wait).toEqual(Option.some(expect.anything()))
      expect(reported).toEqual([
        expect.objectContaining({
          _tag: 'ReactionFailed',
          reaction: 'receipt',
          sequence: Option.some(1),
        }),
      ])
      expect(other.keys).toHaveLength(1)
      // A new process: the backoff it read from the store has not elapsed.
      const journal = openJournal(path)
      const again = await make(journal)
      await reactAt(again, 1_100)
      expect(handler.calls()).toBe(1)
      await reactAt(again, 1_600)
      expect(handler.calls()).toBe(2)
      expect(await tags(journal)).toEqual(['ConfirmedPayment', 'SentReceipt'])
      expect(await cursorOf(journal)).toEqual(Option.some({ cursor: 1, attempts: 0 }))
    },
  )

  it('is not parked for eight failures over its backoff, and is once past parkAfter too', async () => {
    const journal = openJournal()
    const handler = failing(Number.MAX_SAFE_INTEGER)
    const server = await run(
      serverJournal({ sync: Orders, journal, server: SERVER, reactions: [receiptOf(handler.run)] }),
    )
    await pay(server, 'o1')
    await pay(server, 'o2')
    // Each pass when its backoff says: 0.5 s doubling to 30 s, eight in about a minute.
    let now = 0
    for (let n = 0; n < 8; n++) {
      const wait = await reactAt(server, now)
      now += Duration.toMillis(Option.getOrThrow(wait))
    }
    expect(handler.calls()).toBe(8)
    expect(now).toBeLessThan(2 * 60 * 1000)
    expect(await run(server.parked)).toEqual([])
    expect(await cursorOf(journal)).toEqual(Option.some({ cursor: 0, attempts: 8 }))
    await reactAt(server, 60 * 60 * 1000 + 1)
    expect(await run(server.parked)).toEqual([
      expect.objectContaining({ reaction: 'receipt', sequence: 1, stale: false }),
    ])
    // Parked, the reaction went on to the next commit, which fails in its turn.
    expect(await cursorOf(journal)).toEqual(Option.some({ cursor: 1, attempts: 1 }))
  })

  it('parks nothing while the journal itself fails', async () => {
    const real = openJournal()
    const handler = counting()
    let broken = true
    const journal: OrdersJournal = {
      ...real,
      read: (...args) =>
        broken ? Effect.fail(new JournalError({ message: 'D1 is down' })) : real.read(...args),
    }
    const server = await run(
      serverJournal({
        sync: Orders,
        journal,
        server: SERVER,
        reactions: [receiptOf(handler.run, { attempts: 1, parkAfter: '0 millis' })],
      }),
    )
    await pay(server, 'o1')
    for (let n = 0; n < 5; n++)
      expect(await reactAt(server, n * 10_000)).toEqual(Option.some(expect.anything()))
    expect(await run(server.parked)).toEqual([])
    expect(await cursorOf(real)).toEqual(Option.some({ cursor: 0, attempts: 0 }))
    broken = false
    await reactAt(server, 60_000)
    expect(handler.keys).toHaveLength(1)
  })
})

describe('a reaction after a reset', () => {
  it('appends its recorded answer in the new history, and makes no second call', async () => {
    const journal = openJournal()
    const handler = counting()
    const server = await run(
      serverJournal({ sync: Orders, journal, server: SERVER, reactions: [receiptOf(handler.run)] }),
    )
    await pay(server, 'o1')
    await reactAt(server)
    await run(journal.reset(key))
    // The same fact again, under its old id, now the new history's first commit.
    await pay(server, 'o1')
    await reactAt(server)
    expect(handler.keys).toHaveLength(1)
    expect(await tags(journal)).toEqual(['ConfirmedPayment', 'SentReceipt'])
  })

  it('runs a reaction on another reaction’s append again for a new trigger at a reused sequence', async () => {
    const journal = openJournal()
    const handler = counting()
    const receipts: Array<string> = []
    const audit = reaction(Orders, {
      name: 'audit',
      on: Receipted,
      run: ({ message, key: runKey }) =>
        Effect.sync(() => void receipts.push(`${message.id}:${runKey}`)),
    })
    const server = await run(
      serverJournal({
        sync: Orders,
        journal,
        server: SERVER,
        reactions: [receiptOf(handler.run), audit],
      }),
    )
    await pay(server, 'o1')
    for (const _ of [1, 2, 3]) await reactAt(server)
    await run(journal.reset(key))
    // Another order's payment at the same sequence, and its receipt at the same place.
    await pay(server, 'o2')
    for (const _ of [1, 2, 3]) await reactAt(server)
    expect(receipts.map(entry => entry.split(':')[0])).toEqual(['o1', 'o2'])
    expect(new Set(receipts.map(entry => entry.split(':')[1])).size).toBe(2)
    expect(await tags(journal)).toEqual(['ConfirmedPayment', 'SentReceipt'])
    expect((await run(journal.read(key, Cursor.make(0))))[1]!.operation.message).toEqual(
      Message.SentReceipt({ id: 'o2' }),
    )
  })

  it('shows a run parked before it as stale, refuses to retry it, and leaves the new history alone', async () => {
    const journal = openJournal()
    let refuse = true
    const handler = counting()
    const parking = reaction(Orders, {
      name: 'receipt',
      on: Confirmed,
      appends: Receipted,
      run: trigger =>
        refuse
          ? Effect.succeed(Array.from({ length: 17 }, () => Message.SentReceipt({ id: 'x' })))
          : handler.run(trigger),
    })
    const server = await run(
      serverJournal({ sync: Orders, journal, server: SERVER, reactions: [parking] }),
    )
    await pay(server, 'o1')
    await reactAt(server)
    const [parked] = await run(server.parked)
    expect(parked).toMatchObject({ sequence: 1, stale: false })
    await run(journal.reset(key))
    refuse = false
    await pay(server, 'o2')
    expect(await run(server.parked)).toEqual([expect.objectContaining({ stale: true })])
    expect(await run(Effect.flip(server.retry(parked!)))).toMatchObject({
      _tag: 'SyncStaleParkedRunError',
    })
    expect(await tags(journal)).toEqual(['ConfirmedPayment'])
    expect(handler.keys).toHaveLength(0)
    await run(server.dismiss(parked!))
    expect(await run(server.parked)).toEqual([])
  })
})

describe('a run that can never succeed', () => {
  it('is parked at once when the journal refuses its append, and a retry after the rule changes appends without calling again', async () => {
    let refused = true
    const journal = openJournal(':memory:', {
      validate: operation => {
        if (refused && (operation.message as { readonly _tag: string })._tag === 'SentReceipt')
          throw new Error('receipts are off')
      },
    })
    const handler = counting()
    const reported: Array<Diagnostic> = []
    const server = await run(
      serverJournal({
        sync: Orders,
        journal,
        server: SERVER,
        reactions: [receiptOf(handler.run)],
        diagnostics: diagnostic => Effect.sync(() => void reported.push(diagnostic)),
      }),
    )
    await pay(server, 'o1')
    await pay(server, 'o2')
    await reactAt(server)
    // Both parked, and the reaction moved past them: compaction may go too.
    expect((await run(server.parked)).map(parked => parked.sequence)).toEqual([1, 2])
    expect(await run(server.settledThrough)).toBe(2)
    expect(reported.map(diagnostic => diagnostic._tag)).toEqual([
      'ReactionParked',
      'ReactionParked',
    ])
    expect(handler.keys).toHaveLength(2)
    refused = false
    const [first] = await run(server.parked)
    await run(server.retry(first!))
    expect(handler.keys).toHaveLength(2)
    expect(await tags(journal)).toEqual(['ConfirmedPayment', 'ConfirmedPayment', 'SentReceipt'])
    expect((await run(server.parked)).map(parked => parked.sequence)).toEqual([2])
  })

  it.each([
    [
      'a Message its appends do not name',
      () => [Message.ConfirmedPayment({ id: 'x', charge: 'free' })],
    ],
    [
      'a seventeenth Message',
      () => Array.from({ length: 17 }, () => Message.SentReceipt({ id: 'x' })),
    ],
  ])('is parked at once when it answers %s', async (_, answer) => {
    const journal = openJournal()
    const server = await run(
      serverJournal({
        sync: Orders,
        journal,
        server: SERVER,
        reactions: [
          reaction(Orders, {
            name: 'receipt',
            on: Confirmed,
            appends: Receipted,
            // What the types refuse, as a handler built elsewhere might return it.
            run: () => Effect.succeed(answer() as ReadonlyArray<Receipt>),
          }),
        ],
      }),
    )
    await pay(server, 'o1')
    await reactAt(server)
    expect(await run(server.parked)).toEqual([expect.objectContaining({ sequence: 1 })])
    expect(await tags(journal)).toEqual(['ConfirmedPayment'])
  })

  it('commits as the new actor once the server’s actor changes, its reply ids being new', async () => {
    const journal = openJournal()
    const handler = counting()
    const first = await run(
      serverJournal({ sync: Orders, journal, server: SERVER, reactions: [receiptOf(handler.run)] }),
    )
    await pay(first, 'o1')
    await reactAt(first)
    const renamed = await run(
      serverJournal({
        sync: Orders,
        journal,
        server: 'other-server',
        reactions: [receiptOf(handler.run)],
      }),
    )
    await pay(renamed, 'o2')
    await reactAt(renamed)
    expect(await run(renamed.parked)).toEqual([])
    const rows = await run(journal.read(key, Cursor.make(0)))
    expect(rows.map(row => [row.operation.message, String(row.actorId)])).toEqual([
      [Message.ConfirmedPayment({ id: 'o1', charge: 'ch_o1' }), SERVER],
      [Message.SentReceipt({ id: 'o1' }), SERVER],
      [Message.ConfirmedPayment({ id: 'o2', charge: 'ch_o2' }), 'other-server'],
      [Message.SentReceipt({ id: 'o2' }), 'other-server'],
    ])
  })
})

describe('a crash', () => {
  it('between the parked row and the cursor leaves one row, and the next pass moves past it', async () => {
    const real = openJournal()
    let crash = true
    const journal: OrdersJournal = {
      ...real,
      cursors: {
        ...real.cursors,
        advance: (...args) => (crash ? Effect.die('crashed') : real.cursors.advance(...args)),
      },
    }
    const parking = reaction(Orders, {
      name: 'receipt',
      on: Confirmed,
      appends: Receipted,
      run: () => Effect.succeed(Array.from({ length: 17 }, () => Message.SentReceipt({ id: 'x' }))),
    })
    const server = await run(
      serverJournal({ sync: Orders, journal, server: SERVER, reactions: [parking] }),
    )
    await pay(server, 'o1')
    // Reported, not thrown: `react` never fails.
    expect(await run(server.react)).toEqual(Option.some(expect.anything()))
    expect(await run(server.parked)).toHaveLength(1)
    expect(await cursorOf(real)).toEqual(Option.some({ cursor: 0, attempts: 0 }))
    crash = false
    await reactAt(server)
    expect(await run(server.parked)).toHaveLength(1)
    expect(await cursorOf(real)).toEqual(Option.some({ cursor: 1, attempts: 0 }))
  })

  it('after the answer is recorded and before its appends makes no second call', async () => {
    const real = openJournal()
    let crash = true
    const journal: OrdersJournal = {
      ...real,
      append: (document, input, principal) =>
        crash && String((input as WrittenOperation).replicaId).startsWith('server/r/')
          ? Effect.die('crashed')
          : real.append(document, input, principal),
    }
    const handler = counting()
    const server = await run(
      serverJournal({ sync: Orders, journal, server: SERVER, reactions: [receiptOf(handler.run)] }),
    )
    await pay(server, 'o1')
    // Reported, not thrown: `react` never fails.
    expect(await run(server.react)).toEqual(Option.some(expect.anything()))
    expect(await tags(real)).toEqual(['ConfirmedPayment'])
    crash = false
    await reactAt(server)
    expect(handler.keys).toHaveLength(1)
    expect(await tags(real)).toEqual(['ConfirmedPayment', 'SentReceipt'])
  })

  it('between the external call and its record runs it again, with the same key', async () => {
    const path = file()
    const keys: Array<string> = []
    let hang = true
    const call = reaction(Orders, {
      name: 'receipt',
      on: Confirmed,
      run: ({ key: runKey }) =>
        Effect.sync(() => void keys.push(runKey)).pipe(
          Effect.andThen(hang ? Effect.never : Effect.void),
        ),
    })
    const first = await run(
      serverJournal({
        sync: Orders,
        journal: openJournal(path),
        server: SERVER,
        reactions: [call],
      }),
    )
    await pay(first, 'o1')
    // The process dies with the call made and nothing recorded.
    const fiber = Effect.runFork(first.react)
    await new Promise(resolve => setTimeout(resolve, 20))
    await Effect.runPromise(Fiber.interrupt(fiber))
    hang = false
    const second = await run(
      serverJournal({
        sync: Orders,
        journal: openJournal(path),
        server: SERVER,
        reactions: [call],
      }),
    )
    await reactAt(second)
    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])
  })
})

describe('declaring reactions', () => {
  it('refuses a cycle, a reaction of another contract with the same types, and two of one name', () => {
    const journal = openJournal()
    const loop = reaction(Orders, {
      name: 'loop',
      on: Receipted,
      appends: Receipted,
      run: () => Effect.succeed([]),
    })
    expect(() =>
      serverJournal({ sync: Orders, journal, server: SERVER, reactions: [loop] }),
    ).toThrow('cycle')
    const Twin = Sync.forApplication(App).make({
      documentId: documentId('orders'),
      shared: Projection.pick(App.model.orders),
      durable: Placed,
      serverOnly: MessageSet.union(Confirmed, Receipted),
    })
    const twin = reaction(Twin, { name: 'twin', on: Confirmed, run: () => Effect.void })
    expect(() =>
      serverJournal({ sync: Orders, journal, server: SERVER, reactions: [twin] }),
    ).toThrow('another contract')
    const one = reaction(Orders, { name: 'same', on: Confirmed, run: () => Effect.void })
    const two = reaction(Orders, { name: 'same', on: Placed, run: () => Effect.void })
    expect(() =>
      serverJournal({ sync: Orders, journal, server: SERVER, reactions: [one, two] }),
    ).toThrow('two reactions')
  })

  it('refuses a Message in both sets when the contract is made', () => {
    expect(() =>
      Sync.forApplication(App).make({
        documentId: documentId('both'),
        shared: Projection.pick(App.model.orders),
        durable: Placed,
        // @ts-expect-error the types refuse it too
        serverOnly: MessageSet.union(Placed, Confirmed),
      }),
    ).toThrow('both durable and server-only')
  })

  it('refuses where it is read, or submitted, a Message both of Sync.define’s predicates accept', async () => {
    const Both = Sync.define({
      documentId: documentId('orders'),
      message: App.Message,
      shared: Schema.Struct({ n: Schema.Number }),
      empty: { n: 0 },
      durable: () => true,
      serverOnly: message => message._tag === 'ConfirmedPayment',
      replay: state => state,
    })
    const sent = entry(Message.ConfirmedPayment({ id: 'o1', charge: 'c' }))
    const replica = await run(Both.openReplica(memoryStorage(), { replicaId: replicaId('tab') }))
    expect(
      await run(Effect.flip(replica.submit(Message.ConfirmedPayment({ id: 'o1', charge: 'c' })))),
    ).toMatchObject({
      _tag: 'InvalidOutboxError',
      message: 'Message is one only the server appends',
    })
    expect(() => Both.journalContract().operation.decode(sent)).toThrow(AmbiguousMessageError)
    expect(() => Both.codec.normalizeOperation(sent)).toThrow(AmbiguousMessageError)
    expect(
      Both.journalContract().operation.decode(entry(Message.PlacedOrder({ id: 'o', cents: 1 })))
        .opId,
    ).toBe('tab:1')
  })

  it('refuses a name that is not one, and a set of another application', () => {
    expect(() => reaction(Orders, { name: 'a/b', on: Confirmed, run: () => Effect.void })).toThrow(
      'not a reaction name',
    )
    const Other = Surface.application({
      Model,
      Message,
      initial: { orders: [], draft: '' },
      update,
    })
    expect(() =>
      reaction(Orders, {
        name: 'other',
        on: MessageSet.make(Other, [Message.ConfirmedPayment]),
        run: () => Effect.void,
      }),
    ).toThrow('another application')
  })
})

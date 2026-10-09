/**
 * The server's side of an exchange over a `foldkit-durable` journal: what a
 * replica sends is appended in order and acknowledged; what cannot be taken
 * is rejected by its id, so the operations behind it still commit; and the
 * reply carries what committed since, a checkpoint below the compacted floor,
 * and whether more follows.
 */
import { Effect, Exit, Fiber, Scope } from 'effect'
import { ActorId, DocumentId, Journal, OpId, Sequence } from 'foldkit-durable'
import { MessageSet, Projection } from 'foldkit-surface'
import { afterEach, describe, expect, it } from 'vitest'
import { Sync, documentId, sequence, type Operation, type TransportClient } from '../src/index.js'
import { journalChanges, journalExchange, serveJournal } from '../src/journal.js'
import { socketPair } from './sockets.js'
import {
  App,
  Message,
  Todos,
  closeScopes,
  openJournal,
  openScope,
  pendingOf,
  replica,
  send,
} from './fixtures/todos.js'

afterEach(() => {
  closeScopes()
})

describe('journalExchange', () => {
  it('appends what a replica sends, acknowledges it, and replicas converge through it', async () => {
    const journal = openJournal()
    const exchange = journalExchange({ sync: Todos, journal, principal: 'ada' })
    const writer = await replica('a')
    await Effect.runPromise(writer.submit(Message.CreatedTodo({ id: 't1', title: 'Milk' })))
    await Effect.runPromise(
      writer.synchronize.pipe(Effect.provide(Sync.transport.fromPromise(exchange))),
    )
    expect(Effect.runSync(writer.status).pending).toBe(0)
    const reader = await replica('b')
    await Effect.runPromise(
      reader.synchronize.pipe(Effect.provide(Sync.transport.fromPromise(exchange))),
    )
    expect(Effect.runSync(reader.shared).todos).toEqual([{ id: 't1', title: 'Milk' }])
  })

  it('rejects an operation whose message does not decode, and commits the ones behind it', async () => {
    const journal = openJournal()
    const exchange = journalExchange({ sync: Todos, journal, principal: 'ada' })
    const [first, second] = await pendingOf('a', ['Milk', 'Eggs'])
    // A client that skipped its checks: an empty title.
    const tampered = { ...first!, message: { _tag: 'CreatedTodo', id: 'a0', title: '' } }
    const reply = await send(exchange, 0, [tampered, second!])
    expect(reply.rejected).toEqual([first!.opId])
    expect(reply.reasons).toEqual([
      { opId: first!.opId, reason: 'Not an operation this server accepts' },
    ])
    expect(reply.acknowledged).toEqual([second!.opId])
    expect(reply.committed).toEqual([second!.opId])
  })

  it('rejects an operation naming another document', async () => {
    const journal = openJournal()
    const exchange = journalExchange({ sync: Todos, journal, principal: 'ada' })
    const [operation] = await pendingOf('a', ['Milk'])
    const reply = await send(exchange, 0, [{ ...operation!, documentId: documentId('another') }])
    expect(reply).toMatchObject({
      rejected: [operation!.opId],
      reasons: [{ opId: operation!.opId, reason: 'Not an operation this server accepts' }],
      acknowledged: [],
    })
  })

  it('rejects an operation the journal’s own validation refuses', async () => {
    const exchange = journalExchange({ sync: Todos, journal: openJournal(), principal: 'ada' })
    const [operation] = await pendingOf('a', ['Milk'])
    const reply = await send(exchange, 0, [{ ...operation!, baseCursor: sequence(9) }])
    // Said in a fixed sentence: the validation's own message is an internal one.
    expect(reply).toMatchObject({
      rejected: [operation!.opId],
      reasons: [{ opId: operation!.opId, reason: 'Not a valid operation' }],
      acknowledged: [],
    })
  })

  it('rejects what `refuse` refuses, unread by the journal, and takes the rest', async () => {
    const journal = openJournal()
    const exchange = journalExchange({
      sync: Todos,
      journal,
      principal: 'guest',
      refuse: operation => operation.localSequence === 1,
    })
    const [first, second] = await pendingOf('a', ['Milk', 'Eggs'])
    const reply = await send(exchange, 0, [first!, second!])
    expect(reply).toMatchObject({
      rejected: [first!.opId],
      reasons: [{ opId: first!.opId, reason: 'This connection may not make changes' }],
      acknowledged: [second!.opId],
    })
    expect(reply.committed).toEqual([second!.opId])
  })

  it('rejects an id reused for other content', async () => {
    const journal = openJournal()
    const exchange = journalExchange({ sync: Todos, journal, principal: 'ada' })
    const [operation] = await pendingOf('a', ['Milk'])
    await send(exchange, 0, [operation!])
    const reused = { ...operation!, message: { _tag: 'CreatedTodo', id: 'a0', title: 'Tea' } }
    expect(await send(exchange, 1, [reused])).toMatchObject({
      rejected: [operation!.opId],
      reasons: [{ opId: operation!.opId, reason: 'Its id was already used for another' }],
      acknowledged: [],
    })
  })

  it('sends the reason a contract rule gave, and a fixed one when it gave none', async () => {
    const Ruled = Sync.forApplication(App)
      .withPrincipal<string>()
      .make({
        documentId: documentId('todos'),
        shared: Projection.pick(App.model.todos),
        durable: MessageSet.make(App, [Message.CreatedTodo]),
        authorize: {
          CreatedTodo: ({ message }) =>
            message.title === 'Tea'
              ? { allowed: false, reason: 'No tea here' }
              : message.title !== 'Gin',
        },
      })
    const scope = openScope()
    const journal = Effect.runSync(
      Journal.make<Operation, typeof Ruled extends Sync<Message, infer S> ? S : never, string>({
        ...Ruled.journalContract(),
        file: ':memory:',
        opId: operation => OpId.make(operation.opId),
        actorId: principal => ActorId.make(principal),
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )
    const exchange = journalExchange({ sync: Ruled, journal, principal: 'ada' })
    const [tea, gin, milk] = await pendingOf('a', ['Tea', 'Gin', 'Milk'])
    expect(await send(exchange, 0, [tea!, gin!, milk!])).toMatchObject({
      rejected: [tea!.opId, gin!.opId],
      reasons: [
        { opId: tea!.opId, reason: 'No tea here' },
        { opId: gin!.opId, reason: 'Refused by the server' },
      ],
      acknowledged: [milk!.opId],
    })
  })

  it('refuses a cursor ahead of the journal before appending anything', async () => {
    const journal = openJournal()
    const exchange = journalExchange({ sync: Todos, journal, principal: 'ada' })
    const pending = await pendingOf('a', ['Milk'])
    await expect(send(exchange, 5, pending)).rejects.toThrow(/Cursor 5 is ahead of the server's 0/)
    expect(Effect.runSync(journal.cursor(DocumentId.make('todos')))).toBe(0)
  })

  it('answers a replica of another epoch from the start, so it rebuilds', async () => {
    const journal = openJournal()
    const exchange = journalExchange({ sync: Todos, journal, principal: 'ada' })
    await send(exchange, 0, await pendingOf('a', ['Milk', 'Eggs']))
    const before = Effect.runSync(journal.epoch(DocumentId.make('todos')))
    Effect.runSync(journal.reset(DocumentId.make('todos')))
    await send(exchange, 0, await pendingOf('b', ['Tea']))
    // The replica's cursor 2 points into the history that was reset away.
    const reply = Todos.codec.decodeExchange(await exchange.exchange(sequence(2), [], before))
    expect(reply.operations).toHaveLength(1)
    expect(reply.epoch).not.toBe(before)
  })

  it('fails the exchange only for an entry that names no operation', async () => {
    const exchange = journalExchange({ sync: Todos, journal: openJournal(), principal: 'ada' })
    // @ts-expect-error an entry that is no operation, as a broken client might send
    const broken: Operation = { nothing: true }
    await expect(send(exchange, 0, [broken])).rejects.toThrow(/names no operation/)
  })

  it('settles on every exchange, so a write that failed is tried again', async () => {
    let settled = 0
    const exchange = journalExchange({
      sync: Todos,
      journal: openJournal(),
      principal: 'ada',
      settle: Effect.sync(() => {
        settled += 1
      }),
    })
    await send(exchange, 0, [])
    await send(exchange, 0, [])
    expect(settled).toBe(2)
  })

  it('pages what committed, and says when more follows', async () => {
    const journal = openJournal()
    const exchange = journalExchange({ sync: Todos, journal, principal: 'ada', limit: 1 })
    await send(exchange, 0, await pendingOf('a', ['Milk', 'Eggs']))
    const first = await send(exchange, 0, [])
    expect(first.committed).toHaveLength(1)
    expect(first.more).toBe(true)
    expect((await send(exchange, 2, [])).more).toBe(false)
  })

  it('answers a cursor below the compacted floor with a checkpoint', async () => {
    const journal = openJournal()
    const exchange = journalExchange({ sync: Todos, journal, principal: 'ada' })
    await send(exchange, 0, await pendingOf('a', ['Milk', 'Eggs']))
    Effect.runSync(journal.compact(DocumentId.make('todos'), Sequence.make(2)))
    const reply = await send(exchange, 0, [])
    expect(reply.checkpoint).toEqual({
      cursor: 2,
      model: {
        todos: [
          { id: 'a0', title: 'Milk' },
          { id: 'a1', title: 'Eggs' },
        ],
      },
    })
  })
})

describe('journalChanges', () => {
  it('wakes a listener on each commit to its document, until unsubscribed', async () => {
    const journal = openJournal()
    const exchange = journalExchange({ sync: Todos, journal, principal: 'ada' })
    let woken = 0
    const stop = journalChanges(
      journal,
      'todos',
    )(() => {
      woken += 1
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    await send(exchange, 0, await pendingOf('a', ['Milk']))
    await expect.poll(() => woken).toBe(1)
    // A commit to another document the journal keeps is not this one's.
    const [elsewhere] = await pendingOf('c', ['Tea'])
    Effect.runSync(
      journal.append(
        DocumentId.make('other'),
        { ...elsewhere!, documentId: documentId('other') },
        'ada',
      ),
    )
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(woken).toBe(1)
    stop()
    await send(exchange, 1, await pendingOf('b', ['Eggs']))
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(woken).toBe(1)
  })
})

describe('serveJournal', () => {
  it('answers a replica over a socket, and wakes another when one commits', async () => {
    const journal = openJournal()
    const pairs = [socketPair(), socketPair()]
    const stops = pairs.map(({ server }) =>
      serveJournal(server, { sync: Todos, journal, principal: 'ada' }),
    )
    const over = (index: number) =>
      Sync.transport.socket({ makeSocket: () => pairs[index]!.client })
    const watching = await replica('watching')
    const loop = Effect.runFork(watching.start.pipe(Effect.provide(over(0))))
    await new Promise(resolve => setTimeout(resolve, 50))
    const writing = await replica('writing')
    await Effect.runPromise(writing.submit(Message.CreatedTodo({ id: 'w1', title: 'Milk' })))
    await Effect.runPromise(writing.synchronize.pipe(Effect.provide(over(1))))
    expect(Effect.runSync(writing.status).pending).toBe(0)
    // The commit's notice wakes the watching replica, which exchanges and has it.
    await expect
      .poll(() => Effect.runSync(watching.shared).todos, { timeout: 3_000 })
      .toEqual([{ id: 'w1', title: 'Milk' }])
    Effect.runSync(Fiber.interrupt(loop))
    for (const stop of stops) stop()
  })
})

/**
 * A document's laws (#534): what every snapshot keeps, judged where an
 * operation commits, refused as `Invalid` with the law's id, and judged as a
 * hint by a replica's `submit` before its outbox.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect, Exit, Option, Schema, Scope } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import {
  ActorId,
  Cursor,
  DocumentId as JournalDocumentId,
  Journal,
  OpId,
  type Journal as JournalShape,
} from 'foldkit-durable'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Sync,
  SyncRefusal,
  documentId,
  localSequence,
  opId,
  replicaId,
  sequence,
  type Operation,
  type WrittenOperation,
} from '../src/index.js'
import { journalExchange, reaction, serverJournal } from '../src/journal.js'
import { memoryStorage } from './memoryStorage.js'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })
const Model = Schema.Struct({ todos: Schema.Array(Todo), filter: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  DuplicatedTodo: { id: Schema.String, from: Schema.String },
  RemovedTodo: { id: Schema.String },
  ImportedTodo: { id: Schema.String, title: Schema.String },
  ChangedFilter: { filter: Schema.String },
})
type Message = typeof Message.Type

const added = (model: Model, todo: typeof Todo.Type): Model => ({
  ...model,
  todos: [...model.todos, todo],
})
const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    CreatedTodo: ({ id, title }) => ({ model: added(model, { id, title }) }),
    ImportedTodo: ({ id, title }) => ({ model: added(model, { id, title }) }),
    DuplicatedTodo: ({ id, from }) => ({
      model: added(model, {
        id,
        title: model.todos.find(todo => todo.id === from)?.title ?? '',
      }),
    }),
    RemovedTodo: ({ id }) => ({
      model: { ...model, todos: model.todos.filter(todo => todo.id !== id) },
    }),
    ChangedFilter: ({ filter }) => ({ model: { ...model, filter } }),
  })
const App = Surface.application({ Model, Message, initial: { todos: [], filter: '' }, update })
const Created = MessageSet.make(App, [Message.CreatedTodo])
const Imported = MessageSet.make(App, [Message.ImportedTodo])

const options = {
  documentId: documentId('todos-capped'),
  shared: Projection.pick(App.model.todos),
  durable: MessageSet.make(App, [Message.CreatedTodo, Message.DuplicatedTodo, Message.RemovedTodo]),
  serverOnly: Imported,
}

/** The guide's cap, as a law: no rule of `authorize` names it. */
const Capped = Sync.forApplication(App)
  .withPrincipal<string>()
  .make({
    ...options,
    laws: {
      atMost100Todos: {
        holds: ({ after }) => after.todos.length <= 100,
        message: 'A list holds 100 todos',
        path: ['todos'],
      },
    },
  })
/** The same document before the law was added. */
const Uncapped = Sync.forApplication(App).withPrincipal<string>().make(options)
type Shared = Parameters<typeof Capped.replay>[0]
const key = JournalDocumentId.make('todos-capped')
const encode = Schema.encodeSync(Message)
const decodeRefusal = Schema.decodeUnknownSync(SyncRefusal)

const scopes: Array<Scope.Closeable> = []
const folders: Array<string> = []
afterEach(() => {
  for (const scope of scopes.splice(0)) Effect.runSync(Scope.close(scope, Exit.void))
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

type TodosJournal = JournalShape<Operation, Shared, string>

const openJournal = (sync: typeof Capped | typeof Uncapped, at = ':memory:'): TodosJournal => {
  const scope = Effect.runSync(Scope.make())
  scopes.push(scope)
  return Effect.runSync(
    Journal.make<Operation, Shared, string>({
      ...sync.journalContract(),
      file: at,
      opId: operation => OpId.make(operation.opId),
      actorId: principal => ActorId.make(principal),
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
}

const file = (): string => {
  const folder = mkdtempSync(join(tmpdir(), 'laws-'))
  folders.push(folder)
  return join(folder, 'todos.sqlite')
}

/** An entry as a replica would send it. */
const entry = (message: Message, replica = 'tab', n = 1): WrittenOperation =>
  Capped.journalContract().operation.encode({
    protocolVersion: 1,
    schemaVersion: 1,
    documentId: documentId('todos-capped'),
    replicaId: replicaId(replica),
    localSequence: localSequence(n),
    opId: opId(`${replica}:${n}`),
    baseCursor: sequence(0),
    message: encode(message),
  })

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)

/** `count` todos committed, from the replica `seed`. */
const fill = (journal: TodosJournal, count: number, from = 1) =>
  run(
    journal.appendAll(
      key,
      Array.from({ length: count }, (_, index) =>
        entry(
          Message.CreatedTodo({ id: `t${from + index}`, title: 'chore' }),
          'seed',
          from + index,
        ),
      ),
      'ada',
    ),
  )

interface Reply {
  readonly rejected: ReadonlyArray<string>
  readonly acknowledged: ReadonlyArray<string>
  readonly refusals?: ReadonlyArray<{ readonly opId: string; readonly refusal: unknown }>
}

const exchange = async (
  journal: TodosJournal,
  pending: ReadonlyArray<WrittenOperation>,
): Promise<Reply> =>
  (await journalExchange({ sync: Capped, journal, principal: 'ada' }).exchange(
    sequence(0),
    pending,
  )) as Reply

const count = (journal: TodosJournal) =>
  run(journal.load(key)).then(loaded => loaded.snapshot.todos.length)

describe('a law', () => {
  it('refuses at 100 every durable Message that grows the list, as Invalid naming the law', async () => {
    const journal = openJournal(Capped)
    await fill(journal, 100)
    const reply = await exchange(journal, [
      entry(Message.DuplicatedTodo({ id: 'copy', from: 't1' }), 'tab', 1),
      entry(Message.CreatedTodo({ id: 'new', title: 'one more' }), 'tab', 2),
      entry(Message.RemovedTodo({ id: 't1' }), 'tab', 3),
    ])
    expect(reply.rejected).toEqual(['tab:1', 'tab:2'])
    expect(reply.acknowledged).toEqual(['tab:3'])
    const invalid = SyncRefusal.Invalid({
      entity: Option.none(),
      rule: Option.some('atMost100Todos'),
      message: 'A list holds 100 todos',
      path: ['todos'],
    })
    expect(reply.refusals?.map(({ refusal }) => decodeRefusal(refusal))).toEqual([invalid, invalid])
    expect(Sync.isInvalidBy(invalid, Capped.laws.atMost100Todos)).toBe(true)
    expect(await count(journal)).toBe(99)
  })

  it('reaches the replica whose concurrent edit lost, which reads it with isInvalidBy', async () => {
    const journal = openJournal(Capped)
    await fill(journal, 99)
    const transport = Sync.transport.fromPromise(
      journalExchange({ sync: Capped, journal, principal: 'ada' }),
    )
    const open = (name: string) =>
      run(Capped.openReplica(memoryStorage(), { replicaId: replicaId(name) }))
    const ada = await open('ada')
    const ben = await open('ben')
    for (const replica of [ada, ben]) await run(replica.synchronize.pipe(Effect.provide(transport)))
    // Each adds the hundredth: each holds the law over what it holds.
    await run(ada.submit(Message.CreatedTodo({ id: 'a', title: 'mine' })))
    await run(ben.submit(Message.CreatedTodo({ id: 'b', title: 'mine' })))
    for (const replica of [ada, ben]) await run(replica.synchronize.pipe(Effect.provide(transport)))
    expect((await run(ada.status)).rejected).toEqual([])
    const [rejection] = (await run(ben.status)).rejected
    expect(
      Option.exists(rejection!.refusal, refusal =>
        Sync.isInvalidBy(refusal, Capped.laws.atMost100Todos),
      ),
    ).toBe(true)
    expect((await run(ben.shared)).todos.map(todo => todo.id)).not.toContain('b')
  })

  it('names itself, and judges any two snapshots for an audit', () => {
    expect(Capped.laws).toEqual({
      atMost100Todos: { id: 'atMost100Todos', message: 'A list holds 100 todos', path: ['todos'] },
    })
    const of = (n: number): Shared => ({
      todos: Array.from({ length: n }, (_, index) => ({ id: `t${index}`, title: '' })),
    })
    expect(Capped.judge(of(100), of(100))).toEqual(Option.none())
    expect(Capped.judge(of(101), of(101))).toEqual(Option.some(Capped.laws.atMost100Todos))
    expect(Uncapped.laws).toEqual({})
    expect(Uncapped.judge(of(101), of(101))).toEqual(Option.none())
  })

  it('is matched by its id only, in an Invalid', () => {
    const law = Capped.laws.atMost100Todos
    const invalidBy = (rule: Option.Option<string>) =>
      SyncRefusal.Invalid({ entity: Option.none(), rule, message: law.message, path: [] })
    expect(Sync.isInvalidBy(invalidBy(Option.some('another')), law)).toBe(false)
    expect(Sync.isInvalidBy(invalidBy(Option.none()), law)).toBe(false)
    expect(Sync.isInvalidBy(SyncRefusal.Forbidden({ reason: Option.some(law.message) }), law)).toBe(
      false,
    )
  })

  it('names the first broken law in the order declared', () => {
    const Two = Sync.forApplication(App).make({
      ...options,
      laws: {
        named: { holds: ({ after }) => after.todos.every(todo => todo.title !== ''), message: 'n' },
        few: { holds: ({ after }) => after.todos.length <= 1, message: 'f' },
      },
    })
    const after = {
      todos: [
        { id: 'a', title: '' },
        { id: 'b', title: '' },
      ],
    }
    expect(Two.judge({ todos: [] }, after)).toEqual(Option.some(Two.laws.named))
    expect(Two.laws.few.path).toEqual([])
  })

  it('refuses where the contract is made words a refusal cannot carry', () => {
    const law = (message: string, path: ReadonlyArray<'todos'> = []) => ({
      holds: () => true,
      message,
      path,
    })
    expect(() =>
      Sync.forApplication(App).make({ ...options, laws: { ['l'.repeat(501)]: law('m') } }),
    ).toThrow(/does not fit a refusal/)
    expect(() =>
      Sync.forApplication(App).make({ ...options, laws: { long: law('m'.repeat(501)) } }),
    ).toThrow(/does not fit a refusal/)
    expect(() =>
      Sync.forApplication(App).make({
        ...options,
        laws: {
          wide: law(
            'm',
            Array.from({ length: 17 }, () => 'todos' as const),
          ),
        },
      }),
    ).toThrow(/does not fit a refusal/)
    expect(
      Sync.forApplication(App).make({ ...options, laws: { fits: law('m'.repeat(500)) } }).laws.fits
        .message,
    ).toHaveLength(500)
  })
})

describe('a document already breaking a law', () => {
  it('takes the operation that repairs it, and refuses one that does not', async () => {
    const at = file()
    // 101 todos, committed before the law was added.
    await fill(openJournal(Uncapped, at), 101)
    const journal = openJournal(Capped, at)
    const reply = await exchange(journal, [
      entry(Message.CreatedTodo({ id: 'more', title: 'x' }), 'tab', 1),
      entry(Message.RemovedTodo({ id: 't1' }), 'tab', 2),
    ])
    expect(reply.rejected).toEqual(['tab:1'])
    expect(reply.acknowledged).toEqual(['tab:2'])
    expect(await count(journal)).toBe(100)
  })
})

describe("the server's own appends", () => {
  it('are judged: appendAsServer is refused with the law', async () => {
    const journal = openJournal(Capped)
    await fill(journal, 100)
    const server = await run(serverJournal({ sync: Capped, journal, server: 'todos-server' }))
    const refused = await run(
      Effect.flip(
        server.appendAsServer(Message.ImportedTodo({ id: 'i', title: 'x' }), { key: 'import/i' }),
      ),
    )
    expect(refused).toMatchObject({ _tag: 'OperationRejectedError', rule: 'atMost100Todos' })
    expect(await count(journal)).toBe(100)
  })

  it("park a reaction's refused append at once", async () => {
    const journal = openJournal(Capped)
    await fill(journal, 99)
    let calls = 0
    const server = await run(
      serverJournal({
        sync: Capped,
        journal,
        server: 'todos-server',
        reactions: [
          reaction(Capped, {
            name: 'import',
            on: Created,
            appends: Imported,
            run: trigger =>
              Effect.sync(() => {
                calls += 1
                return [Message.ImportedTodo({ id: `i-${trigger.message.id}`, title: 'x' })]
              }),
          }),
        ],
      }),
    )
    // The reaction's cursor starts here: only what commits next triggers it.
    await run(server.react)
    await exchange(journal, [entry(Message.CreatedTodo({ id: 'last', title: 'x' }), 'tab', 1)])
    await run(server.react)
    expect(calls).toBe(1)
    expect((await run(server.parked)).map(parked => parked.sequence)).toEqual([100])
    expect(await count(journal)).toBe(100)
    expect((await run(journal.read(key, Cursor.make(99)))).map(row => row.operation.opId)).toEqual([
      'tab:1',
    ])
  })
})

describe('a replica', () => {
  it('refuses with LawBrokenError, before the outbox, a Message whose result breaks a law', async () => {
    const replica = await run(Capped.openReplica(memoryStorage(), { replicaId: replicaId('ada') }))
    for (let n = 1; n <= 100; n += 1)
      await run(replica.submit(Message.CreatedTodo({ id: `t${n}`, title: 'chore' })))
    const failure = await run(
      Effect.flip(replica.submit(Message.DuplicatedTodo({ id: 'copy', from: 't1' }))),
    )
    expect(failure).toMatchObject({
      _tag: 'LawBrokenError',
      rule: 'atMost100Todos',
      message: 'A list holds 100 todos',
      path: ['todos'],
    })
    expect(await run(replica.pending)).toHaveLength(100)
    expect((await run(replica.shared)).todos).toHaveLength(100)
    // A Message the law takes still goes.
    await run(replica.submit(Message.RemovedTodo({ id: 't1' })))
    expect(await run(replica.pending)).toHaveLength(101)
  })
})

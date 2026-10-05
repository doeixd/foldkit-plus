// @vitest-environment jsdom
import { Duration, Effect, Exit, Option, Schema, Stream } from 'effect'
import { Agent } from 'foldkit-agent'
import { defineMessageUnion } from 'foldkit/message'
import * as Command from 'foldkit/command'
import type * as Update from 'foldkit/update'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  documentId,
  fact,
  forApplication,
  layerFromPromise,
  localSequence,
  mount,
  opId,
  replicaId,
  sequence,
  StorageError,
  type CommittedOperation,
  type Mounted,
  type Reinstall,
  type Replica,
  type Storage,
} from '../src/index.js'
import { unconfirmedEdits } from '../src/mount.js'
import { memoryStorage } from './memoryStorage.js'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })
const ModelSchema = Schema.Struct({
  todos: Schema.Array(Todo),
  selectedTodoId: Schema.NullOr(Schema.String),
  lastError: Schema.NullOr(Schema.String),
})
type Model = typeof ModelSchema.Type
const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  RenamedTodo: { id: Schema.String, title: Schema.String },
  SelectedTodo: { id: Schema.String },
  RequestedRename: { id: Schema.String, title: Schema.String },
  // A local intent whose fact needs an id only the current Model can mint.
  AddedTodo: { title: Schema.String },
  AddedAndSelected: { title: Schema.String },
  // A fact a parent mapped, as `foldChild` maps a child's Commands.
  MappedFact: {},
  // A durable Message whose update returns a fact, which replay could not apply.
  ImportedTodo: { id: Schema.String, title: Schema.String },
  // A local Message whose field transforms: an Option in code, `null` encoded.
  Noted: { note: Schema.OptionFromNullOr(Schema.String) },
})
type Message = typeof Message.Type
const initial: Model = { todos: [], selectedTodoId: null, lastError: null }
const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    CreatedTodo: ({ id, title }) => ({
      model: { ...model, todos: [...model.todos, { id, title }] },
    }),
    RenamedTodo: ({ id, title }) => ({
      model: {
        ...model,
        todos: model.todos.map(todo => (todo.id === id ? { ...todo, title } : todo)),
      },
    }),
    SelectedTodo: ({ id }) => ({ model: { ...model, selectedTodoId: id } }),
    // A local Message whose Command settles into a durable fact.
    RequestedRename: ({ id, title }) => ({
      model,
      commands: [{ name: 'rename', effect: Effect.succeed(Message.RenamedTodo({ id, title })) }],
    }),
    AddedTodo: ({ title }) => ({
      model,
      commands: [fact(Message.CreatedTodo({ id: `t${model.todos.length}`, title }))],
    }),
    MappedFact: () => ({
      model,
      commands: [
        Command.mapMessage(fact(Message.SelectedTodo({ id: 'raw' })), () =>
          Message.SelectedTodo({ id: 'mapped' }),
        ),
      ],
    }),
    ImportedTodo: ({ id, title }) => ({
      model: { ...model, todos: [...model.todos, { id, title }] },
      commands: [fact(Message.SelectedTodo({ id }))],
    }),
    Noted: ({ note }) => ({ model: { ...model, lastError: Option.getOrNull(note) } }),
    // Two facts in order, the second a local one, around an ordinary Command.
    AddedAndSelected: ({ title }) => ({
      model,
      commands: [
        fact(Message.CreatedTodo({ id: `t${model.todos.length}`, title })),
        { name: 'noop', effect: Effect.succeed(Message.SelectedTodo({ id: 'noop' })) },
        fact(Message.SelectedTodo({ id: `t${model.todos.length}` })),
      ],
    }),
  })

const App = Surface.application({ Model: ModelSchema, Message, initial, update })
const TodoSync = forApplication(App).make({
  documentId: documentId('todos'),
  shared: Projection.pick(App.model.todos),
  durable: MessageSet.make(App, [Message.CreatedTodo, Message.RenamedTodo, Message.ImportedTodo]),
})
type Shared = { readonly todos: ReadonlyArray<{ readonly id: string; readonly title: string }> }

const committed = (id: string, title: string, serverSequence: number): CommittedOperation => ({
  protocolVersion: 1,
  schemaVersion: 1,
  documentId: documentId('todos'),
  replicaId: replicaId('b'),
  localSequence: localSequence(serverSequence),
  opId: opId(`b:${serverSequence}`),
  baseCursor: sequence(0),
  message: { _tag: 'CreatedTodo', id, title },
  serverSequence: sequence(serverSequence),
  actorId: 'owner',
})

const text = () => document.body.textContent ?? ''
const pending = (replica: Replica<Message, Shared>) => Effect.runSync(replica.pending)
const exchange = (
  replica: Replica<Message, Shared>,
  response: {
    operations: CommittedOperation[]
    rejected: string[]
    acknowledged?: string[]
    checkpoint?: { cursor: number; model: Shared }
    epoch?: string
  },
) =>
  Effect.runPromise(
    Effect.provide(replica.synchronize, layerFromPromise({ exchange: async () => response })),
  )

/** An agent whose `create_todo` is done only once the server has the todo. */
const createTodoAgent = (
  app: Mounted<Model, Message, Shared>,
  timeout: Duration.Input = Duration.seconds(30),
) =>
  Agent.bind({
    definition: Agent.make({
      messages: Agent.expose(Message, {
        CreatedTodo: {
          name: 'create_todo',
          description: 'Create a todo',
          completion: Agent.when({
            source: app.committed,
            predicate: (shared, request) => shared.todos.some(todo => todo.id === request.id),
            timeout,
          }),
        },
      }),
    }),
    host: app,
  })

describe('Sync.mount', () => {
  let container: HTMLElement
  let replica: Replica<Message, Shared>
  let mounted: Mounted<Model, Message, Shared> | undefined
  const open = async (
    storage: Storage = memoryStorage(),
    onReinstall?: (
      next: Model,
      previous: Model,
      change: Reinstall,
    ) => Update.Return<Model, Message>,
    statuses: (
      changes: Replica<Message, Shared>['statusChanges'],
    ) => Replica<Message, Shared>['statusChanges'] = changes => changes,
  ) => {
    replica = await Effect.runPromise(TodoSync.openReplica(replicaId('a'), storage))
    mounted = mount(App, TodoSync, {
      replica: { ...replica, statusChanges: statuses(replica.statusChanges) },
      container,
      view: (model, h) => ({
        title: 'todos',
        body: h.div(
          [],
          [
            h.ul(
              [],
              model.todos.map(todo => h.li([], [todo.title])),
            ),
            h.p([], [`Selection: ${model.selectedTodoId ?? 'none'}`]),
            h.p([], [model.lastError ?? '']),
          ],
        ),
      }),
      onPersistenceFailure: (model, error) => ({ ...model, lastError: error._tag }),
      onReinstall,
    })
    return mounted
  }

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    container = document.createElement('div')
    container.id = 'app'
    document.body.appendChild(container)
  })
  afterEach(async () => {
    await mounted?.dispose()
    mounted = undefined
    await Effect.runPromise(replica.close)
    container.remove()
    vi.unstubAllGlobals()
  })

  it('applies a durable Message at once through update and persists it after', async () => {
    const app = await open()
    app.dispatch(Message.CreatedTodo({ id: 'a', title: 'Milk' }))
    await vi.waitFor(() => expect(text()).toContain('Milk'))
    await vi.waitFor(() => expect(pending(replica)).toHaveLength(1))
    expect(app.model().todos).toEqual([{ id: 'a', title: 'Milk' }])

    app.dispatch(Message.SelectedTodo({ id: 'a' }))
    await vi.waitFor(() => expect(text()).toContain('Selection: a'))
    expect(pending(replica)).toHaveLength(1)
    expect(app.model().selectedTodoId).toBe('a')
  })

  it('dispatches a Message as its type is, though its fields encode otherwise', async () => {
    const app = await open()
    expect(Exit.isSuccess(app.dispatch(Message.Noted({ note: Option.some('Saved') })))).toBe(true)
    await vi.waitFor(() => expect(app.model().lastError).toBe('Saved'))
    app.dispatch(Message.Noted({ note: Option.none() }))
    await vi.waitFor(() => expect(app.model().lastError).toBeNull())
  })

  it('reports transitions and the Messages the runtime applies, for an agent host', async () => {
    const app = await open()
    let transitions = 0
    const seen: string[] = []
    const stopModel = app.subscribe(() => {
      transitions += 1
    })
    const stopMessages = app.observe(message => seen.push(message._tag))

    app.dispatch(Message.RequestedRename({ id: 'a', title: 'B' }))
    await vi.waitFor(() => expect(seen).toEqual(['RequestedRename', 'RenamedTodo']))
    const reported = transitions
    expect(reported).toBeGreaterThan(0)

    stopModel()
    stopMessages()
    app.dispatch(Message.SelectedTodo({ id: 'a' }))
    await vi.waitFor(() => expect(text()).toContain('Selection: a'))
    expect(seen).toEqual(['RequestedRename', 'RenamedTodo'])
    expect(transitions).toBe(reported)
  })

  it('lets a Command from update settle into a durable fact without wrapping', async () => {
    const app = await open()
    app.dispatch(Message.CreatedTodo({ id: 'a', title: 'Milk' }))
    app.dispatch(Message.RequestedRename({ id: 'a', title: 'Oat milk' }))
    await vi.waitFor(() => expect(text()).toContain('Oat milk'))
    await vi.waitFor(() => expect(pending(replica)).toHaveLength(2))
  })

  it('applies a fact within the transition that returned it, before the next Message', async () => {
    const app = await open()
    // Dispatched back to back, so an ordinary Command's Message would reach update only
    // after both: each intent would see no todos and mint the same id.
    app.dispatch(Message.AddedTodo({ title: 'Milk' }))
    app.dispatch(Message.AddedTodo({ title: 'Eggs' }))
    await vi.waitFor(() => expect(app.model().todos).toHaveLength(2))
    expect(app.model().todos.map(todo => todo.id)).toEqual(['t0', 't1'])
    await vi.waitFor(() => expect(pending(replica)).toHaveLength(2))
    expect(pending(replica).map(operation => operation.message)).toEqual([
      { _tag: 'CreatedTodo', id: 't0', title: 'Milk' },
      { _tag: 'CreatedTodo', id: 't1', title: 'Eggs' },
    ])
  })

  it('treats a fact a parent mapped as the ordinary Command it now is', async () => {
    const app = await open()
    app.dispatch(Message.MappedFact())
    await vi.waitFor(() => expect(app.model().selectedTodoId).toBe('mapped'))
  })

  it('does not apply a durable Message’s fact within its transition', async () => {
    const app = await open()
    const seen: string[] = []
    const stop = app.observe(message => seen.push(message._tag))
    // Replay would not apply the fact, so the live transition must not either: it arrives
    // as an ordinary Command's Message, after one dispatched next.
    app.dispatch(Message.ImportedTodo({ id: 'i', title: 'Imported' }))
    app.dispatch(Message.SelectedTodo({ id: 'next' }))
    await vi.waitFor(() => expect(seen).toHaveLength(3))
    expect(seen).toEqual(['ImportedTodo', 'SelectedTodo', 'SelectedTodo'])
    expect(app.model().selectedTodoId).toBe('i')
    stop()
  })

  it('applies several facts in order, persisting only the durable ones', async () => {
    const app = await open()
    const seen: string[] = []
    const stop = app.observe(message => seen.push(message._tag))
    app.dispatch(Message.AddedAndSelected({ title: 'Milk' }))
    await vi.waitFor(() => expect(app.model().selectedTodoId).toBe('noop'))
    // Each fact applies to the Model the one before it left, and the ordinary Command's
    // Message comes after both.
    expect(app.model().todos).toEqual([{ id: 't0', title: 'Milk' }])
    expect(seen).toEqual(['AddedAndSelected', 'CreatedTodo', 'SelectedTodo', 'SelectedTodo'])
    await vi.waitFor(() => expect(pending(replica)).toHaveLength(1))
    stop()
  })

  it('reverts a durable edit whose persist fails and reports the failure', async () => {
    const base = memoryStorage()
    const app = await open({
      ...base,
      save: (state, revision) =>
        revision === null
          ? base.save(state, revision)
          : Effect.fail(new StorageError({ message: 'disk full' })),
    })
    app.dispatch(Message.SelectedTodo({ id: 'a' }))
    app.dispatch(Message.CreatedTodo({ id: 'a', title: 'Milk' }))
    await vi.waitFor(() => expect(text()).toContain('StorageError'))
    expect(text()).not.toContain('Milk')
    // Local state survives the revert; only the shared slice is re-installed.
    expect(text()).toContain('Selection: a')
    expect(pending(replica)).toEqual([])
    expect(app.model().lastError).toBe('StorageError')
  })

  describe('settled', () => {
    it('resolves once the Model has what an exchange committed, though the mount hears late', async () => {
      // Each status arrives late, and twice, as a checkpoint at the same cursor
      // repeats one: the second asks for no reinstall while the first's waits.
      const app = await open(undefined, undefined, changes =>
        changes.pipe(
          Stream.tap(() => Effect.sleep('20 millis')),
          Stream.flatMap(status => Stream.make(status, status)),
        ),
      )
      await app.settled()
      await exchange(replica, { operations: [committed('r', 'Remote', 1)], rejected: [] })
      // The replica has it now; the mount has not heard yet.
      expect(app.model().todos).toEqual([])
      await app.settled()
      expect(app.model().todos).toEqual([{ id: 'r', title: 'Remote' }])
    })

    it('resolves once a failed persist has been reverted', async () => {
      const base = memoryStorage()
      const app = await open({
        ...base,
        save: (state, revision) =>
          revision === null
            ? base.save(state, revision)
            : Effect.sleep('10 millis').pipe(
                Effect.andThen(Effect.fail(new StorageError({ message: 'disk full' }))),
              ),
      })
      await app.settled()
      app.dispatch(Message.CreatedTodo({ id: 'a', title: 'Milk' }))
      await app.settled()
      expect(app.model().todos).toEqual([])
      expect(app.model().lastError).toBe('StorageError')
    })

    it('resolves at once when nothing is owed', async () => {
      const app = await open()
      await app.settled()
      let resolved = false
      void app.settled().then(() => (resolved = true))
      await Promise.resolve()
      expect(resolved).toBe(true)
    })

    it('rejects after dispose, and a wait that dispose cut short', async () => {
      const base = memoryStorage()
      const app = await open({
        ...base,
        save: (state, revision) =>
          revision === null
            ? base.save(state, revision)
            : Effect.sleep('50 millis').pipe(Effect.andThen(base.save(state, revision))),
      })
      await app.settled()
      app.dispatch(Message.CreatedTodo({ id: 'a', title: 'Milk' }))
      const waiting = app.settled()
      const disposing = app.dispose()
      mounted = undefined
      await expect(waiting).rejects.toThrow(/disposed before it settled/)
      await disposing
      await expect(app.settled()).rejects.toThrow(/after dispose/)
    })
  })

  it('tells onReinstall when the server was reset, by a new epoch', async () => {
    const changes: Array<boolean> = []
    await open(memoryStorage(), (next, _previous, { reset }) => {
      changes.push(reset)
      return { model: next }
    })
    const answer = (epoch: string, title: string) => ({
      operations: [committed('r', title, 1)],
      rejected: [],
      epoch,
    })
    await exchange(replica, answer('first', 'One'))
    await vi.waitFor(() => expect(text()).toContain('One'))
    // The same history again: no reset. Then a new one: a reset.
    await exchange(replica, {
      operations: [committed('s', 'Two', 2)],
      rejected: [],
      epoch: 'first',
    })
    await vi.waitFor(() => expect(text()).toContain('Two'))
    await exchange(replica, answer('second', 'Three'))
    await vi.waitFor(() => expect(text()).toContain('Three'))
    expect(changes).toEqual([false, false, true])
  })

  it('installs the shared slice after an exchange commits a remote change', async () => {
    const app = await open()
    await exchange(replica, { operations: [committed('r', 'Remote', 1)], rejected: [] })
    await vi.waitFor(() => expect(text()).toContain('Remote'))
    expect(app.model().todos).toEqual([{ id: 'r', title: 'Remote' }])
  })

  it('does not hand the application the status a mount starts with', async () => {
    let calls = 0
    const app = await open(memoryStorage(), next => {
      calls += 1
      return { model: next }
    })
    app.dispatch(Message.SelectedTodo({ id: 'a' }))
    await vi.waitFor(() => expect(text()).toContain('Selection: a'))
    // The replica's first status reaches the mount by now; it changed nothing shared.
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(calls).toBe(0)
  })

  it('hands an exchange’s reinstall to the application, which returns the transition', async () => {
    const seen: Array<readonly [number, number]> = []
    const app = await open(memoryStorage(), (next, previous) => {
      seen.push([previous.todos.length, next.todos.length])
      // Local state the application carries across, and a Command it returns.
      return {
        model: { ...next, selectedTodoId: next.todos.at(-1)?.id ?? null },
        commands: [fact(Message.RenamedTodo({ id: 'r', title: 'Seen' }))],
      }
    })
    const models: Array<Model> = []
    const stop = app.subscribe(() => models.push(app.model()))
    // Once the mount has the replica's first status, so the exchange is a change it hears of.
    await new Promise(resolve => setTimeout(resolve, 50))
    await exchange(replica, { operations: [committed('r', 'Remote', 1)], rejected: [] })
    await vi.waitFor(() => expect(app.model().selectedTodoId).toBe('r'))
    stop()
    expect(seen).toContainEqual([0, 1])
    // A fact it returns is applied in the same transition, so no Model ever shows the
    // selection without it, and is persisted like any other.
    expect(app.model().todos).toEqual([{ id: 'r', title: 'Seen' }])
    expect(
      models.some(model => model.selectedTodoId === 'r' && model.todos[0]?.title === 'Remote'),
    ).toBe(false)
    await vi.waitFor(() => expect(pending(replica)).toHaveLength(1))
  })

  it('hands a failed persist’s revert to the application too', async () => {
    const base = memoryStorage()
    const seen: Array<readonly [number, number, string | null]> = []
    const app = await open(
      {
        ...base,
        save: (state, revision) =>
          revision === null
            ? base.save(state, revision)
            : Effect.fail(new StorageError({ message: 'disk full' })),
      },
      (next, previous) => {
        seen.push([previous.todos.length, next.todos.length, next.lastError])
        return { model: next }
      },
    )
    app.dispatch(Message.CreatedTodo({ id: 'a', title: 'Milk' }))
    await vi.waitFor(() => expect(app.model().lastError).toBe('StorageError'))
    // It sees the Model with the edit reverted and the failure already reported.
    expect(seen).toContainEqual([1, 0, 'StorageError'])
  })

  it('exposes the committed slice, which a local edit leaves and an exchange advances', async () => {
    const app = await open()
    let notified = 0
    const stop = app.committed.subscribe(() => {
      notified += 1
    })
    app.dispatch(Message.CreatedTodo({ id: 'a', title: 'Milk' }))
    await vi.waitFor(() => expect(pending(replica)).toHaveLength(1))

    expect(app.model().todos).toEqual([{ id: 'a', title: 'Milk' }])
    expect(app.committed.get()).toEqual({ todos: [] })

    const before = notified
    await exchange(replica, { operations: [committed('r', 'Remote', 1)], rejected: [] })
    await vi.waitFor(() => expect(notified).toBeGreaterThan(before))
    stop()

    expect(app.committed.get()).toEqual({ todos: [{ id: 'r', title: 'Remote' }] })
    await vi.waitFor(() =>
      expect(app.model().todos).toEqual([
        { id: 'r', title: 'Remote' },
        { id: 'a', title: 'Milk' },
      ]),
    )
  })

  it('tells committed subscribers about a checkpoint that keeps the cursor', async () => {
    const app = await open()
    let notified = 0
    app.committed.subscribe(() => {
      notified += 1
    })
    // The mount's status subscription starts with the runtime.
    await vi.waitFor(() => expect(notified).toBeGreaterThan(0))

    const before = notified
    const checkpointed = { todos: [{ id: 'c', title: 'Checkpoint' }] }
    await exchange(replica, {
      operations: [],
      rejected: [],
      checkpoint: { cursor: 0, model: checkpointed },
    })

    await vi.waitFor(() => expect(notified).toBeGreaterThan(before))
    expect(app.committed.get()).toEqual(checkpointed)
  })

  it('re-installs the shared slice when an exchange only acknowledges an edit', async () => {
    const app = await open()
    app.dispatch(Message.CreatedTodo({ id: 'a', title: 'Milk' }))
    await vi.waitFor(() => expect(pending(replica)).toHaveLength(1))

    // Acknowledged but not returned: the replica drops it without committing it.
    await exchange(replica, { operations: [], rejected: [], acknowledged: ['a:1'] })

    await vi.waitFor(() => expect(app.model().todos).toEqual([]))
    expect(pending(replica)).toEqual([])
  })

  const ownCommitted = (id: string, n: number): CommittedOperation => ({
    ...committed(id, id, n),
    replicaId: replicaId('a'),
    localSequence: localSequence(n),
    opId: opId(`a:${n}`),
  })
  const ids = (model: Model) => model.todos.map(todo => todo.id)

  it.each([
    ['commits', { operations: [ownCommitted('B', 1)], rejected: [] }],
    ['only acknowledges', { operations: [], rejected: [], acknowledged: ['a:1'] }],
    ['rejects', { operations: [], rejected: ['a:1'] }],
  ])(
    'keeps edits still waiting for the replica when an exchange that %s an earlier one settles',
    async (_, response) => {
      const base = memoryStorage()
      let gate: Promise<void> | undefined
      const app = await open({
        ...base,
        save: (state, revision) =>
          gate === undefined
            ? base.save(state, revision)
            : Effect.promise(() => gate!).pipe(Effect.andThen(base.save(state, revision))),
      })
      app.dispatch(Message.CreatedTodo({ id: 'B', title: 'B' }))
      await vi.waitFor(() => expect(pending(replica)).toHaveLength(1))

      let release!: () => void
      gate = new Promise(resolve => {
        release = resolve
      })
      // B's exchange holds the replica lock in its slow persist; A and C wait behind it.
      const settling = exchange(replica, response)
      await new Promise(resolve => setTimeout(resolve, 10))
      app.dispatch(Message.CreatedTodo({ id: 'A', title: 'A' }))
      app.dispatch(Message.CreatedTodo({ id: 'C', title: 'C' }))
      await vi.waitFor(() => expect(ids(app.model())).toEqual(expect.arrayContaining(['A', 'C'])))

      release()
      await settling
      await vi.waitFor(() => expect(pending(replica).map(op => op.opId)).toContain('a:3'))
      await vi.waitFor(() =>
        expect(app.model().todos).toEqual(Effect.runSync(replica.shared).todos),
      )
      expect(ids(app.model())).toEqual(expect.arrayContaining(['A', 'C']))
      expect(new Set(ids(app.model())).size).toBe(ids(app.model()).length)
    },
  )

  it('shows a remote change while durable edits keep overlapping', async () => {
    const base = memoryStorage()
    const app = await open({
      ...base,
      save: (state, revision) =>
        revision === null
          ? base.save(state, revision)
          : Effect.sleep(Duration.millis(20)).pipe(Effect.andThen(base.save(state, revision))),
    })
    let dispatched = 0
    const editing = setInterval(() => {
      dispatched += 1
      app.dispatch(Message.CreatedTodo({ id: `e${dispatched}`, title: 'Edit' }))
    }, 5)
    try {
      await new Promise(resolve => setTimeout(resolve, 30))
      const syncing = exchange(replica, { operations: [committed('r', 'Remote', 1)], rejected: [] })
      await vi.waitFor(() => expect(ids(app.model())).toContain('r'), { timeout: 400 })
      // Edits were still waiting for the replica when the remote change showed.
      expect(pending(replica).length).toBeLessThan(dispatched)
      await syncing
    } finally {
      clearInterval(editing)
    }
    await vi.waitFor(() => expect(pending(replica)).toHaveLength(dispatched), { timeout: 5_000 })
    await vi.waitFor(() => expect(app.model().todos).toEqual(Effect.runSync(replica.shared).todos))
    expect(new Set(ids(app.model())).size).toBe(ids(app.model()).length)
  })

  it('reverts a failed edit while a later one waits, and keeps the later one', async () => {
    const base = memoryStorage()
    let gate: Promise<void> | undefined
    let savesAfterRelease = 0
    const app = await open({
      ...base,
      save: (state, revision) => {
        if (gate === undefined) return base.save(state, revision)
        return Effect.promise(() => gate!).pipe(
          Effect.andThen(
            Effect.suspend(() => {
              savesAfterRelease += 1
              // The exchange saves first, then A's submit, then C's.
              return savesAfterRelease === 2
                ? Effect.fail(new StorageError({ message: 'disk full' }))
                : base.save(state, revision)
            }),
          ),
        )
      },
    })
    let release!: () => void
    gate = new Promise(resolve => {
      release = resolve
    })
    const settling = exchange(replica, { operations: [committed('r', 'Remote', 1)], rejected: [] })
    await new Promise(resolve => setTimeout(resolve, 10))
    app.dispatch(Message.CreatedTodo({ id: 'A', title: 'A' }))
    app.dispatch(Message.CreatedTodo({ id: 'C', title: 'C' }))

    release()
    await settling
    await vi.waitFor(() => expect(app.model().lastError).toBe('StorageError'))
    await vi.waitFor(() => expect(pending(replica)).toHaveLength(1))
    await vi.waitFor(() => expect(ids(app.model())).toEqual(['r', 'C']))
  })

  it('replays only the edits the replica does not hold yet', () => {
    const queued = { message: 'queued', started: undefined }
    const inFlight = { message: 'in flight', started: 4 }
    // The in-flight submit has not landed: the sequence is still the one it started at.
    expect(unconfirmedEdits([inFlight, queued], 4)).toEqual(['in flight', 'queued'])
    // It landed and moved the sequence, so `shared` already holds it.
    expect(unconfirmedEdits([inFlight, queued], 5)).toEqual(['queued'])
  })

  it('keeps refreshing and notifying after a committed listener throws', async () => {
    // The runtime schedules through queueMicrotask too, so wrap it rather than replace it.
    const reported: unknown[] = []
    const schedule = globalThis.queueMicrotask
    vi.stubGlobal('queueMicrotask', (callback: () => void) =>
      schedule(() => {
        try {
          callback()
        } catch (error) {
          reported.push(error)
        }
      }),
    )
    const app = await open()
    let later = 0
    app.committed.subscribe(() => {
      throw new Error('listener bug')
    })
    app.committed.subscribe(() => {
      later += 1
    })
    await vi.waitFor(() => expect(later).toBeGreaterThan(0))

    await exchange(replica, { operations: [committed('r', 'Remote', 1)], rejected: [] })
    await vi.waitFor(() => expect(app.model().todos).toEqual([{ id: 'r', title: 'Remote' }]))
    await exchange(replica, { operations: [committed('s', 'Second', 2)], rejected: [] })
    await vi.waitFor(() => expect(app.model().todos.map(todo => todo.id)).toEqual(['r', 's']))
    expect(reported).toContainEqual(new Error('listener bug'))
  })

  it('never completes an agent on an edit the server rejects', async () => {
    const app = await open()
    const result = Effect.runPromise(
      Effect.result(
        createTodoAgent(app, Duration.millis(200)).messages.dispatch('create_todo', {
          id: 'a',
          title: 'Milk',
        }),
      ),
    )
    await vi.waitFor(() => expect(pending(replica)).toHaveLength(1))

    await exchange(replica, { operations: [], rejected: ['a:1'] })

    expect(((await result) as { failure?: { _tag: string } }).failure?._tag).toBe(
      'AgentCompletionTimeoutError',
    )
    expect(app.committed.get()).toEqual({ todos: [] })
  })

  it('lets an agent complete on the committed edit, not the optimistic one', async () => {
    const app = await open()

    let settled = false
    const result = Effect.runPromise(
      createTodoAgent(app).messages.dispatch('create_todo', { id: 'a', title: 'Milk' }),
    ).finally(() => {
      settled = true
    })
    await vi.waitFor(() => expect(pending(replica)).toHaveLength(1))
    // Visible at once, and still not done: the persist notified the committed
    // view, which does not have the edit until the server commits it.
    expect(app.model().todos).toEqual([{ id: 'a', title: 'Milk' }])
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(settled).toBe(false)

    await exchange(replica, {
      operations: [{ ...committed('a', 'Milk', 1), replicaId: replicaId('a'), opId: opId('a:1') }],
      rejected: [],
    })

    expect((await result).completion).toEqual({ status: 'completed' })
    expect(pending(replica)).toEqual([])
  })

  it('reverts an operation the server rejects', async () => {
    const app = await open()
    app.dispatch(Message.CreatedTodo({ id: 'a', title: 'Milk' }))
    await vi.waitFor(() => expect(pending(replica)).toHaveLength(1))
    await exchange(replica, { operations: [], rejected: ['a:1'] })
    await vi.waitFor(() => expect(text()).not.toContain('Milk'))
    expect(app.model().todos).toEqual([])
  })

  it('disposes when a persist dies with a defect', async () => {
    const base = memoryStorage()
    const app = await open({
      ...base,
      save: (state, revision) =>
        revision === null ? base.save(state, revision) : Effect.die(new Error('storage defect')),
    })
    app.dispatch(Message.CreatedTodo({ id: 'a', title: 'Milk' }))
    await vi.waitFor(() => expect(text()).toContain('storage defect'))

    const outcome = await Promise.race([
      app.dispose().then(() => 'disposed'),
      new Promise(resolve => setTimeout(() => resolve('hung'), 500)),
    ])
    mounted = undefined
    expect(outcome).toBe('disposed')
  })

  it('waits for an in-flight persist before disposing', async () => {
    const base = memoryStorage()
    let release!: () => void
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    const app = await open({
      ...base,
      save: (state, revision) =>
        revision === null
          ? base.save(state, revision)
          : Effect.promise(() => held).pipe(Effect.andThen(base.save(state, revision))),
    })
    app.dispatch(Message.CreatedTodo({ id: 'a', title: 'Milk' }))
    await vi.waitFor(() => expect(text()).toContain('Milk'))

    let disposed = false
    const disposing = app.dispose().then(() => {
      disposed = true
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(disposed).toBe(false)
    expect(pending(replica)).toEqual([])

    release()
    await disposing
    expect(pending(replica)).toHaveLength(1)
  })
})

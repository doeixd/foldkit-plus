// @vitest-environment jsdom
import { Duration, Effect, Schema } from 'effect'
import { Agent } from 'foldkit-agent'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  documentId,
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
  type Replica,
  type Storage,
} from '../src/index.js'
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
  })

const App = Surface.application({ Model: ModelSchema, Message, initial, update })
const TodoSync = forApplication(App).make({
  documentId: documentId('todos'),
  shared: Projection.pick(App.fields.todos),
  durable: MessageSet.make(App, [Message.CreatedTodo, Message.RenamedTodo]),
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
  const open = async (storage: Storage = memoryStorage()) => {
    replica = await Effect.runPromise(TodoSync.openReplica(replicaId('a'), storage))
    mounted = mount(App, TodoSync, {
      replica,
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
    expect(transitions).toBeGreaterThanOrEqual(2)

    stopModel()
    stopMessages()
    app.dispatch(Message.SelectedTodo({ id: 'a' }))
    await vi.waitFor(() => expect(text()).toContain('Selection: a'))
    expect(seen).toEqual(['RequestedRename', 'RenamedTodo'])
  })

  it('lets a Command from update settle into a durable fact without wrapping', async () => {
    const app = await open()
    app.dispatch(Message.CreatedTodo({ id: 'a', title: 'Milk' }))
    app.dispatch(Message.RequestedRename({ id: 'a', title: 'Oat milk' }))
    await vi.waitFor(() => expect(text()).toContain('Oat milk'))
    await vi.waitFor(() => expect(pending(replica)).toHaveLength(2))
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

  it('installs the shared slice after an exchange commits a remote change', async () => {
    const app = await open()
    await exchange(replica, { operations: [committed('r', 'Remote', 1)], rejected: [] })
    await vi.waitFor(() => expect(text()).toContain('Remote'))
    expect(app.model().todos).toEqual([{ id: 'r', title: 'Remote' }])
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

  it.each([
    ['commits', { operations: [ownCommitted('B', 1)], rejected: [] }],
    ['only acknowledges', { operations: [], rejected: [], acknowledged: ['a:1'] }],
    ['rejects', { operations: [], rejected: ['a:1'] }],
  ])(
    'keeps an edit still persisting when an exchange that %s an earlier one settles',
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
      // B's exchange holds the replica lock in its slow persist; A's submit waits behind it.
      const settling = exchange(replica, response)
      await new Promise(resolve => setTimeout(resolve, 10))
      app.dispatch(Message.CreatedTodo({ id: 'A', title: 'A' }))
      await vi.waitFor(() => expect(app.model().todos.map(todo => todo.id)).toContain('A'))

      release()
      await settling
      await vi.waitFor(() => expect(pending(replica).map(op => op.opId)).toContain('a:2'))
      await vi.waitFor(() =>
        expect(app.model().todos).toEqual(Effect.runSync(replica.shared).todos),
      )
      expect(app.model().todos.map(todo => todo.id)).toContain('A')
    },
  )

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

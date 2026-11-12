// @vitest-environment jsdom
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  documentId,
  forApplication,
  mount,
  replicaId,
  type Mounted,
  type Replica,
  type ReplicaError,
} from '../src/index.js'
import { memoryStorage } from './memoryStorage.js'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })
const ModelSchema = Schema.Struct({
  todos: Schema.Array(Todo),
  filter: Schema.String,
  lastError: Schema.String,
})
type Model = typeof ModelSchema.Type
const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  Filtered: { filter: Schema.String },
  // Removes the todos the person is looking at: the slice depends on the local `filter`.
  ClearedShown: {},
  // Reads `filter` and writes an equal slice whatever it holds.
  Touched: {},
  // Reads only the slice.
  ClearedFirst: {},
})
type Message = typeof Message.Type
const initial: Model = { todos: [], filter: '', lastError: '' }
const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    CreatedTodo: ({ id, title }) => ({
      model: { ...model, todos: [...model.todos, { id, title }] },
    }),
    Filtered: ({ filter }) => ({ model: { ...model, filter } }),
    ClearedShown: () => ({
      model: { ...model, todos: model.todos.filter(todo => todo.title !== model.filter) },
    }),
    Touched: () => ({
      model: { ...model, todos: model.filter === '' ? model.todos : [...model.todos] },
    }),
    ClearedFirst: () => ({ model: { ...model, todos: model.todos.slice(1) } }),
  })

const App = Surface.application({ Model: ModelSchema, Message, initial, update })
const TodoSync = forApplication(App).make({
  documentId: documentId('closure'),
  shared: Projection.pick(App.model.todos),
  durable: MessageSet.make(App, [
    Message.CreatedTodo,
    Message.ClearedShown,
    Message.Touched,
    Message.ClearedFirst,
  ]),
})
type Shared = { readonly todos: ReadonlyArray<{ readonly id: string; readonly title: string }> }

describe('Sync.mount closure check', () => {
  let container: HTMLElement
  let replica: Replica<Message, Shared>
  let mounted: Mounted<Model, Message, Shared> | undefined
  const failures: ReplicaError[] = []
  const afterUpdates: Model[] = []

  const open = async () => {
    replica = await Effect.runPromise(
      TodoSync.openReplica(memoryStorage(), { replicaId: replicaId('a') }),
    )
    mounted = mount(App, TodoSync, {
      replica,
      container,
      view: (model, h) => ({
        title: 'todos',
        body: h.div([], [model.todos.map(t => t.title).join()]),
      }),
      onPersistenceFailure: (model, error) => {
        failures.push(error)
        return { ...model, lastError: error.message }
      },
      afterUpdate: model => {
        afterUpdates.push(model)
        return { model }
      },
    })
    return mounted
  }
  const pending = () => Effect.runSync(replica.pending).length
  const send = async (app: Mounted<Model, Message, Shared>, message: Message) => {
    app.dispatch(message)
    await app.settled()
  }

  beforeEach(() => {
    failures.length = 0
    afterUpdates.length = 0
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

  it('refuses a durable Message whose slice depends on a local field, before the outbox, naming it', async () => {
    const app = await open()
    await send(app, Message.CreatedTodo({ id: 'a', title: 'x' }))
    await send(app, Message.CreatedTodo({ id: 'b', title: 'y' }))
    await send(app, Message.Filtered({ filter: 'x' }))
    expect(pending()).toBe(2)
    const before = app.model()
    const seen = afterUpdates.length

    await send(app, Message.ClearedShown())

    expect(pending()).toBe(2)
    expect(failures.map(error => [error._tag, error.message])).toEqual([
      [
        'ReplayError',
        'durable "ClearedShown" reads Model fields outside the shared projection: filter',
      ],
    ])
    // The refused transition returned the Model it was given: `afterUpdate` saw that very object.
    expect(afterUpdates[seen]).toBe(before)
    expect(app.model().todos).toEqual(before.todos)
    expect(app.model().filter).toBe('x')
  })

  it('accepts a Message that reads a local field without changing the slice', async () => {
    const app = await open()
    await send(app, Message.CreatedTodo({ id: 'a', title: 'x' }))
    await send(app, Message.Filtered({ filter: 'x' }))
    await send(app, Message.Touched())
    expect(failures).toEqual([])
    expect(pending()).toBe(2)
  })

  it('accepts a Message over a slice that holds pending edits, which the replica has not committed', async () => {
    const app = await open()
    await send(app, Message.CreatedTodo({ id: 'a', title: 'x' }))
    await send(app, Message.CreatedTodo({ id: 'b', title: 'y' }))
    await send(app, Message.Filtered({ filter: 'unmatched' }))
    await send(app, Message.ClearedFirst())
    expect(failures).toEqual([])
    expect(pending()).toBe(3)
    expect(app.model().todos.map(todo => todo.id)).toEqual(['b'])
  })

  it('accepts a Message while no local field has left its initial value', async () => {
    const app = await open()
    await send(app, Message.CreatedTodo({ id: 'a', title: 'x' }))
    await send(app, Message.ClearedShown())
    expect(failures).toEqual([])
    expect(pending()).toBe(2)
  })

  it('stays a refusal after a refusal: the next durable Message is persisted', async () => {
    const app = await open()
    await send(app, Message.CreatedTodo({ id: 'a', title: 'x' }))
    await send(app, Message.Filtered({ filter: 'x' }))
    await send(app, Message.ClearedShown())
    await send(app, Message.CreatedTodo({ id: 'b', title: 'y' }))
    expect(failures).toHaveLength(1)
    expect(pending()).toBe(2)
  })
})

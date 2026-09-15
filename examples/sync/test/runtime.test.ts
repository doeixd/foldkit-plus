// @vitest-environment jsdom
import { Duration, Effect } from 'effect'
import { IDBFactory } from 'fake-indexeddb'
import { Agent } from 'foldkit-agent'
import { ReplicaId, Sync, type Mounted } from 'foldkit-sync'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Message, type Model, type Shared } from '../src/app.js'
import { openJournal } from '../src/journal.js'
import { mountReplica } from '../src/runtime.js'
import { mountTodos, TodoSync } from '../src/sync.js'
import { closeStorages, openStorage } from './helpers.js'

afterEach(async () => {
  vi.unstubAllGlobals()
  await closeStorages()
})

const stubAnimationFrames = () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
}

it('runs the application over Sync.mount: durable changes render at once and persist after', async () => {
  stubAnimationFrames()
  const storage = await Effect.runPromise(openStorage('runtime', new IDBFactory()))
  let release!: () => void
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  const replica = await Effect.runPromise(
    TodoSync.openReplica(ReplicaId.make('a'), {
      ...storage,
      save: (state, revision) =>
        Effect.gen(function* () {
          if (revision !== null) yield* Effect.promise(() => held)
          yield* storage.save(state, revision)
        }),
    }),
  )
  const container = document.createElement('div')
  container.id = 'sync-runtime'
  document.body.appendChild(container)
  const runtime = mountReplica(replica, container)
  try {
    runtime.send(Message.CreatedTodo({ id: 'a', title: 'Applied first' }))
    runtime.send(Message.SelectedTodo({ id: 'a' }))
    await vi.waitFor(() => expect(document.body.textContent).toContain('Selection: a'))
    expect(document.body.textContent).toContain('Applied first')
    expect(Effect.runSync(replica.pending)).toHaveLength(0)
    release()
    await vi.waitFor(() => expect(Effect.runSync(replica.pending)).toHaveLength(1))
    expect(document.body.textContent).toContain('Applied first')
  } finally {
    release()
    await runtime.dispose()
    await Effect.runPromise(replica.close)
    container.remove()
  }
})

describe('a browser agent on the mounted app', () => {
  /** `create_todo` is done only once the server has committed the todo. */
  const createTodoAgent = (app: Mounted<Model, Message, Shared>, timeout: Duration.Input) =>
    Agent.bind({
      definition: Agent.make({
        messages: Agent.expose(Message, {
          CreatedTodo: {
            name: 'create_todo',
            description: 'Create a shared todo',
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

  const setup = async (canWrite: boolean) => {
    stubAnimationFrames()
    const journal = openJournal(':memory:')
    const replica = await Effect.runPromise(
      TodoSync.openReplica(
        ReplicaId.make('browser'),
        await Effect.runPromise(openStorage('browser', new IDBFactory())),
      ),
    )
    const container = document.createElement('div')
    container.id = 'sync-agent'
    document.body.appendChild(container)
    const app = mountTodos(replica, { container, view: () => ({ title: 'todos', body: null }) })
    const synchronize = () =>
      Effect.runPromise(
        Effect.provide(
          replica.synchronize,
          Sync.transport.fromPromise(
            journal.transport({ actorId: 'owner', documentId: 'todos', canWrite }),
          ),
        ),
      )
    const pending = () => Effect.runSync(replica.pending)
    const cleanup = async () => {
      await app.dispose()
      await Effect.runPromise(replica.close)
      journal.close()
      container.remove()
    }
    return { app, synchronize, pending, cleanup }
  }

  it('completes after the exchange commits the edit, not when the Model shows it', async () => {
    const { app, synchronize, pending, cleanup } = await setup(true)
    try {
      let settled = false
      const result = Effect.runPromise(
        createTodoAgent(app, Duration.seconds(30)).messages.dispatch('create_todo', {
          id: 'a',
          title: 'Milk',
        }),
      ).finally(() => {
        settled = true
      })
      // The persist notifies the committed view, so the predicate is re-read
      // here and must still be false: the Model has the todo, the server does not.
      await vi.waitFor(() => expect(pending()).toHaveLength(1))
      expect(app.model().todos).toEqual([{ id: 'a', title: 'Milk' }])
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(settled).toBe(false)

      await synchronize()

      expect((await result).completion).toEqual({ status: 'completed' })
      expect(app.committed.get().todos).toEqual([{ id: 'a', title: 'Milk' }])
    } finally {
      await cleanup()
    }
  })

  it('never completes on an edit the server rejects', async () => {
    const { app, synchronize, pending, cleanup } = await setup(false)
    try {
      const result = Effect.runPromise(
        Effect.result(
          createTodoAgent(app, Duration.millis(200)).messages.dispatch('create_todo', {
            id: 'a',
            title: 'Milk',
          }),
        ),
      )
      await vi.waitFor(() => expect(pending()).toHaveLength(1))

      await synchronize()

      const outcome = await result
      expect(outcome._tag).toBe('Failure')
      if (outcome._tag === 'Failure') {
        expect(outcome.failure._tag).toBe('AgentCompletionTimeoutError')
      }
      expect(pending()).toEqual([])
      expect(app.committed.get().todos).toEqual([])
    } finally {
      await cleanup()
    }
  })
})

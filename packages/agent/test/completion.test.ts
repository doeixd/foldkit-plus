import { Cause, Duration, Effect } from 'effect'
import { Projection } from 'foldkit-surface'
import { beforeEach, describe, expect, it } from 'vitest'
import { Agent } from '../src/index.js'
import type { Completion, DispatchResult } from '../src/types.js'
import {
  type Message,
  type Model,
  Message as MessageUnion,
  Model as ModelSchema,
  emptyModel,
} from './todoApp.js'

/**
 * A host that runs an `update` of the test's choosing and reports every Message
 * it processes, which is what a completion contract needs to observe.
 */
const makeHost = (update?: (message: Message, emit: (message: Message) => void) => void) => {
  const dispatched: Array<Message> = []
  const listeners = new Set<(message: Message) => void>()

  const emit = (message: Message): void => {
    for (const listener of [...listeners]) listener(message)
  }

  return {
    dispatched,
    emit,
    listeners,
    host: {
      model: () => emptyModel,
      dispatch: (message: Message) => {
        dispatched.push(message)
        emit(message)
        update?.(message, emit)
      },
      observe: (listener: (message: Message) => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
  }
}

const contractOf = (completion: Completion<{ readonly id: string }, Message, Message>) =>
  Agent.make({
    messages: Agent.expose(MessageUnion, {
      RequestedDeleteTodo: { name: 'delete_todo', description: 'Delete a todo', completion },
    }),
  })

const deletedTodos = (ids: ReadonlyArray<string>) =>
  MessageUnion.ReceivedTodos({ todos: ids.map(id => ({ id, title: id, completed: true })) })

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.result(effect))

describe('completion tracking', () => {
  it('reports the Message that completed the operation', async () => {
    const { host } = makeHost((_, emit) => emit(deletedTodos([])))
    const runtime = Agent.bind({
      definition: contractOf({ success: MessageUnion.ReceivedTodos }),
      host,
    })

    const result = await Effect.runPromise(
      runtime.messages.dispatch('delete_todo', { id: 'todo-1' }),
    )

    expect(result.completion).toMatchObject({ status: 'completed' })
    expect(result.completion?.message?._tag).toBe('ReceivedTodos')
  })

  it('catches a completion that update produces synchronously', async () => {
    // The listener has to be attached before the dispatch, or this is lost.
    const { host } = makeHost((_, emit) => emit(deletedTodos([])))
    const runtime = Agent.bind({
      definition: contractOf({ success: MessageUnion.ReceivedTodos, timeout: Duration.millis(50) }),
      host,
    })

    const result = await run(runtime.messages.dispatch('delete_todo', { id: 'todo-1' }))

    expect(result._tag).toBe('Success')
  })

  it('reports a declared failure Message as failed, not as an error', async () => {
    const { host } = makeHost((_, emit) =>
      emit(MessageUnion.FailedToLoadTodos({ message: 'nope' })),
    )
    const runtime = Agent.bind({
      definition: contractOf({
        success: MessageUnion.ReceivedTodos,
        failure: MessageUnion.FailedToLoadTodos,
      }),
      host,
    })

    const result = await Effect.runPromise(
      runtime.messages.dispatch('delete_todo', { id: 'todo-1' }),
    )

    expect(result.completion).toMatchObject({ status: 'failed' })
  })

  it('times out without claiming anything was undone', async () => {
    const { host, dispatched } = makeHost()
    const runtime = Agent.bind({
      definition: contractOf({ success: MessageUnion.ReceivedTodos, timeout: Duration.millis(10) }),
      host,
    })

    const result = await run(runtime.messages.dispatch('delete_todo', { id: 'todo-1' }))

    expect(result._tag).toBe('Failure')
    const failure = (result as { failure: { _tag: string; message: string } }).failure
    expect(failure._tag).toBe('AgentCompletionTimeoutError')
    expect(failure.message).toMatch(/still reached update/)
    // The Message was dispatched. Only the waiting stopped.
    expect(dispatched).toHaveLength(1)
  })

  it('releases its listener on every exit path', async () => {
    const { host, listeners } = makeHost((_, emit) => emit(deletedTodos([])))
    const runtime = Agent.bind({
      definition: contractOf({ success: MessageUnion.ReceivedTodos, timeout: Duration.millis(10) }),
      host,
    })

    await run(runtime.messages.dispatch('delete_todo', { id: 'a' }))
    expect(listeners.size).toBe(0)

    const timingOut = Agent.bind({
      definition: contractOf({ success: MessageUnion.ReceivedTodos, timeout: Duration.millis(10) }),
      host: makeHost().host,
    })
    await run(timingOut.messages.dispatch('delete_todo', { id: 'b' }))
    expect(listeners.size).toBe(0)
  })

  type HostDispatch = () => void | Promise<void> | Effect.Effect<void>

  const failingDispatches: ReadonlyArray<readonly [string, HostDispatch]> = [
    [
      'throws synchronously',
      () => {
        throw new Error('nope')
      },
    ],
    ['rejects its Promise', () => Promise.reject(new Error('nope'))],
    ['returns a dying Effect', () => Effect.die('nope')],
  ]

  it.each(failingDispatches)(
    'releases its listener when the host dispatch %s',
    async (_label, dispatch) => {
      const listeners = new Set<(message: Message) => void>()
      const runtime = Agent.bind({
        definition: contractOf({
          success: MessageUnion.ReceivedTodos,
          timeout: Duration.seconds(30),
        }),
        host: {
          model: () => emptyModel,
          dispatch: (_: Message) => dispatch(),
          observe: (listener: (message: Message) => void) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
          },
        },
      })

      const exit = await Effect.runPromiseExit(
        runtime.messages.dispatch('delete_todo', { id: 'a' }),
      )

      expect(exit._tag).toBe('Failure')
      // The timeout is far longer than this test: a listener still here is
      // leaked, not merely waiting.
      expect(listeners.size).toBe(0)
    },
  )

  it('ignores a completing Message that arrives after the timeout', async () => {
    const { host, emit } = makeHost()
    const runtime = Agent.bind({
      definition: contractOf({ success: MessageUnion.ReceivedTodos, timeout: Duration.millis(10) }),
      host,
    })

    const result = await run(runtime.messages.dispatch('delete_todo', { id: 'todo-1' }))
    expect(result._tag).toBe('Failure')

    // A settled invocation must not settle twice.
    expect(() => emit(deletedTodos([]))).not.toThrow()
  })

  it('gives each concurrent invocation the Message it owns', async () => {
    const { host, emit } = makeHost()
    const runtime = Agent.bind({
      definition: contractOf({
        success: MessageUnion.ReceivedTodos,
        correlate: (request, result) =>
          result._tag === 'ReceivedTodos' && result.todos[0]?.id === request.id,
        timeout: Duration.seconds(1),
      }),
      host,
    })

    const first = Effect.runPromise(runtime.messages.dispatch('delete_todo', { id: 'todo-1' }))
    const second = Effect.runPromise(runtime.messages.dispatch('delete_todo', { id: 'todo-2' }))

    emit(deletedTodos(['todo-2']))
    emit(deletedTodos(['todo-1']))

    expect((await first).completion?.message).toMatchObject({ todos: [{ id: 'todo-1' }] })
    expect((await second).completion?.message).toMatchObject({ todos: [{ id: 'todo-2' }] })
  })

  it('keeps the first matching Message when two arrive before it resumes', async () => {
    // Both are emitted synchronously inside dispatch, so the waiter sees the
    // second while still holding the first. First match wins.
    const { host } = makeHost((_, emit) => {
      emit(deletedTodos(['first']))
      emit(deletedTodos(['second']))
    })
    const runtime = Agent.bind({
      definition: contractOf({ success: MessageUnion.ReceivedTodos, timeout: Duration.millis(50) }),
      host,
    })

    const result = await Effect.runPromise(runtime.messages.dispatch('delete_todo', { id: 'a' }))

    expect(result.completion?.message).toMatchObject({ todos: [{ id: 'first' }] })
  })

  it('leaves capabilities without a contract at validated dispatch', async () => {
    const { host } = makeHost()
    const runtime = Agent.bind({
      definition: Agent.make({
        messages: Agent.expose(MessageUnion, { RequestedCreateTodo: 'Create a todo' }),
      }),
      host,
    })

    const result = await Effect.runPromise(
      runtime.messages.dispatch('requested_create_todo', { title: 'x' }),
    )

    expect(result).not.toHaveProperty('completion')
  })

  it('never subscribes for an invocation that was refused', async () => {
    const { host, listeners } = makeHost()
    const runtime = Agent.bind({
      definition: Agent.make({
        messages: Agent.expose(MessageUnion, {
          RequestedDeleteTodo: {
            name: 'delete_todo',
            description: 'Delete a todo',
            authorize: () => false,
            completion: { success: MessageUnion.ReceivedTodos },
          },
        }),
      }),
      host,
    })

    const result = await run(runtime.messages.dispatch('delete_todo', { id: 'a' }))

    expect((result as { failure: { _tag: string } }).failure._tag).toBe('AgentAuthorizationError')
    expect(listeners.size).toBe(0)
  })
})

describe('a contract that declares completion', () => {
  it('is refused at bind when the host cannot observe Messages', () => {
    expect(() =>
      Agent.bind({
        definition: contractOf({ success: MessageUnion.ReceivedTodos }),
        host: { model: () => emptyModel, dispatch: (_: Message) => {} },
      }),
    ).toThrow(/cannot observe Messages/)
  })

  it('names the capabilities that need it', () => {
    expect(() =>
      Agent.bind({
        definition: contractOf({ success: MessageUnion.ReceivedTodos }),
        host: { model: () => emptyModel, dispatch: (_: Message) => {} },
      }),
    ).toThrow(/"delete_todo"/)
  })

  it('rejects a contract naming no success Message', () => {
    expect(() => contractOf({ success: [] })).toThrow(/names no success Message/)
  })

  it('rejects a Message listed as both success and failure', () => {
    expect(() =>
      contractOf({
        success: MessageUnion.ReceivedTodos,
        failure: MessageUnion.ReceivedTodos,
      }),
    ).toThrow(/both a success and a failure/)
  })
})

describe('cancelling while waiting for completion', () => {
  let host: ReturnType<typeof makeHost>

  beforeEach(() => {
    host = makeHost()
  })

  /** Long enough that a test finishing quickly cannot be a timeout in disguise. */
  const NEVER = Duration.seconds(30)

  const waiting = (timeout: Duration.Duration = NEVER) =>
    Agent.bind({
      definition: contractOf({ success: MessageUnion.ReceivedTodos, timeout }),
      host: host.host,
    })

  it('stops waiting and says the Message was still dispatched', async () => {
    const controller = new AbortController()
    const started = Date.now()

    const pending = run(
      waiting().messages.dispatch('delete_todo', { id: 'a' }, { signal: controller.signal }),
    )
    // Aborted after dispatch: the Message is already in the Runtime, and the
    // two synchronous pre-dispatch checks are long past.
    await Promise.resolve()
    controller.abort()
    const result = await pending

    expect(Date.now() - started).toBeLessThan(1000)
    const failure = (result as { failure: { _tag: string; dispatched: boolean; message: string } })
      .failure
    expect(failure._tag).toBe('AgentCancelledError')
    expect(failure.dispatched).toBe(true)
    expect(failure.message).toMatch(/still reached update/)
    // Nothing was undone, and the listener is released by the one finalizer.
    expect(host.dispatched).toHaveLength(1)
    expect(host.listeners.size).toBe(0)
  })

  it('keeps the completion that already arrived rather than settling twice', async () => {
    const controller = new AbortController()
    host = makeHost((_, emit) => emit(deletedTodos([])))

    const result = await run(
      waiting().messages.dispatch('delete_todo', { id: 'a' }, { signal: controller.signal }),
    )
    controller.abort()

    expect(result._tag).toBe('Success')
    expect(
      (result as { success: { completion: { status: string } } }).success.completion.status,
    ).toBe('completed')
    expect(host.listeners.size).toBe(0)
  })

  it('settles a wait whose signal aborted while the host was still dispatching', async () => {
    // The abort lands after the last pre-dispatch check and before the wait
    // begins, so nothing is listening for it when it fires.
    const controller = new AbortController()
    host = makeHost()
    const slow = {
      ...host.host,
      dispatch: async (message: Message) => {
        host.dispatched.push(message)
        controller.abort()
        await new Promise(resolve => setTimeout(resolve, 5))
      },
    }
    const runtime = Agent.bind({
      definition: contractOf({ success: MessageUnion.ReceivedTodos, timeout: NEVER }),
      host: slow,
    })

    const result = await run(
      runtime.messages.dispatch('delete_todo', { id: 'a' }, { signal: controller.signal }),
    )

    const failure = (result as { failure: { _tag: string; dispatched: boolean } }).failure
    expect(failure._tag).toBe('AgentCancelledError')
    expect(failure.dispatched).toBe(true)
    expect(host.dispatched).toHaveLength(1)
    expect(host.listeners.size).toBe(0)
  })

  it('removes its abort listener when the completion arrives instead', async () => {
    // Emitted a tick later, so the abort listener is certainly registered by
    // the time the completion resolves the race.
    host = makeHost((_, emit) => void setTimeout(() => emit(deletedTodos([])), 5))
    const signal = new AbortController().signal
    let listening = 0
    const { addEventListener, removeEventListener } = AbortSignal.prototype
    signal.addEventListener = (...args: Parameters<AbortSignal['addEventListener']>) => {
      listening += 1
      addEventListener.apply(signal, args)
    }
    signal.removeEventListener = (...args: Parameters<AbortSignal['removeEventListener']>) => {
      listening -= 1
      removeEventListener.apply(signal, args)
    }

    await run(waiting().messages.dispatch('delete_todo', { id: 'a' }, { signal }))

    // A long-lived signal would otherwise accumulate one listener per dispatch.
    expect(listening).toBe(0)
  })

  it('refuses before dispatch when the signal is already aborted', async () => {
    const result = await run(
      waiting().messages.dispatch('delete_todo', { id: 'a' }, { signal: AbortSignal.abort() }),
    )

    const failure = (result as { failure: { _tag: string; dispatched: boolean } }).failure
    expect(failure._tag).toBe('AgentCancelledError')
    expect(failure.dispatched).toBe(false)
    expect(host.dispatched).toEqual([])
    expect(host.listeners.size).toBe(0)
  })

  it('still times out when no signal was supplied', async () => {
    const result = await run(
      waiting(Duration.millis(20)).messages.dispatch('delete_todo', { id: 'a' }),
    )

    expect((result as { failure: { _tag: string } }).failure._tag).toBe(
      'AgentCompletionTimeoutError',
    )
    expect(host.listeners.size).toBe(0)
  })
})

describe('summarize', () => {
  const result = (completion?: DispatchResult['completion']): DispatchResult => ({
    name: 'requested_create_todo',
    tag: 'RequestedCreateTodo',
    message: { _tag: 'RequestedCreateTodo' } as never,
    invocation: {} as never,
    ...(completion === undefined ? {} : { completion }),
  })

  it('reports validated dispatch when there is no completion contract', () => {
    expect(Agent.summarize(result())).toEqual({
      ok: true,
      text: 'Dispatched RequestedCreateTodo',
    })
  })

  it('reports a completed completion', () => {
    expect(
      Agent.summarize(result({ status: 'completed', message: { _tag: 'CreatedTodo' } as never })),
    ).toEqual({ ok: true, text: 'Completed: CreatedTodo' })
  })

  it('reports a failed completion', () => {
    expect(
      Agent.summarize(result({ status: 'failed', message: { _tag: 'CreateFailed' } as never })),
    ).toEqual({ ok: false, text: 'Failed: CreateFailed' })
  })

  it('reports a completion that application state settled', () => {
    expect(Agent.summarize(result({ status: 'completed' }))).toEqual({
      ok: true,
      text: 'Completed: RequestedCreateTodo reached its declared state',
    })
  })
})

describe('state completion', () => {
  /** A host whose Model changes through `set`, notifying subscribers as a Runtime would. */
  const makeStateHost = (update?: (message: Message, set: (model: Model) => void) => void) => {
    let current = emptyModel
    const listeners = new Set<() => void>()
    const dispatched: Array<Message> = []
    const set = (next: Model): void => {
      current = next
      for (const listener of [...listeners]) listener()
    }
    return {
      dispatched,
      listeners,
      set,
      /** Changes the Model without notifying anyone. */
      replace: (next: Model): void => {
        current = next
      },
      host: {
        model: () => current,
        dispatch: (message: Message) => {
          dispatched.push(message)
          update?.(message, set)
        },
        subscribe: (listener: () => void) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      },
    }
  }

  const Todos = Projection.of(ModelSchema)({ todos: true })
  const withTitle = (title: string): Model => ({
    ...emptyModel,
    todos: [{ id: title, title, completed: false }],
  })

  const creating = (timeout: Duration.Input = Duration.seconds(30)) =>
    Agent.make({
      messages: Agent.expose(MessageUnion, {
        RequestedCreateTodo: {
          name: 'create_todo',
          description: 'Create a todo',
          completion: Agent.when({
            projection: Todos,
            predicate: (value, request) => value.todos.some(todo => todo.title === request.title),
            timeout,
          }),
        },
      }),
    })

  it('completes when update makes the state true, reporting no Message', async () => {
    const state = makeStateHost((message, set) => {
      if (message._tag === 'RequestedCreateTodo') set(withTitle(message.title))
    })
    const runtime = Agent.bind({ definition: creating(), host: state.host })

    const result = await Effect.runPromise(
      runtime.messages.dispatch('create_todo', { title: 'milk' }),
    )

    expect(result.completion).toEqual({ status: 'completed' })
    expect(state.listeners.size).toBe(0)
  })

  it('completes when something else makes the state true later', async () => {
    const state = makeStateHost()
    const runtime = Agent.bind({ definition: creating(Duration.seconds(1)), host: state.host })

    const pending = run(runtime.messages.dispatch('create_todo', { title: 'milk' }))
    setTimeout(() => state.set(withTitle('bread')), 1)
    setTimeout(() => state.set(withTitle('milk')), 5)
    const result = await pending

    expect(result._tag).toBe('Success')
    expect(state.listeners.size).toBe(0)
  })

  it('completes when update changed the state without notifying', async () => {
    const state = makeStateHost()
    state.host.dispatch = (message: Message) => {
      state.dispatched.push(message)
      if (message._tag === 'RequestedCreateTodo') state.replace(withTitle(message.title))
    }
    const runtime = Agent.bind({ definition: creating(Duration.millis(50)), host: state.host })

    const result = await run(runtime.messages.dispatch('create_todo', { title: 'milk' }))

    expect(result._tag).toBe('Success')
  })

  it('completes when update notifies a true state and reverts it before dispatch returns', async () => {
    const state = makeStateHost((message, set) => {
      if (message._tag !== 'RequestedCreateTodo') return
      set(withTitle(message.title))
      set(emptyModel)
    })
    const runtime = Agent.bind({ definition: creating(Duration.millis(50)), host: state.host })

    const result = await run(runtime.messages.dispatch('create_todo', { title: 'milk' }))

    expect(result._tag).toBe('Success')
  })

  it('completes at once when the state already holds, whoever made it so', async () => {
    const state = makeStateHost()
    state.replace(withTitle('milk'))
    const runtime = Agent.bind({ definition: creating(Duration.millis(50)), host: state.host })

    const result = await run(runtime.messages.dispatch('create_todo', { title: 'milk' }))

    expect(result._tag).toBe('Success')
    expect(state.dispatched).toHaveLength(1)
  })

  it('times out when the state never arrives, without claiming anything was undone', async () => {
    const state = makeStateHost()
    const runtime = Agent.bind({ definition: creating(Duration.millis(20)), host: state.host })

    const result = await run(runtime.messages.dispatch('create_todo', { title: 'milk' }))

    expect((result as { failure: { _tag: string } }).failure._tag).toBe(
      'AgentCompletionTimeoutError',
    )
    expect(state.dispatched).toHaveLength(1)
    expect(state.listeners.size).toBe(0)
  })

  it('fails the invocation, not the host, when the predicate throws', async () => {
    const state = makeStateHost()
    const runtime = Agent.bind({
      definition: Agent.make({
        messages: Agent.expose(MessageUnion, {
          RequestedCreateTodo: {
            name: 'create_todo',
            description: 'Create a todo',
            completion: Agent.when({
              projection: Todos,
              predicate: value => {
                if (value.todos.length > 0) throw new Error('broken predicate')
                return false
              },
            }),
          },
        }),
      }),
      host: state.host,
    })

    const pending = Effect.runPromiseExit(
      runtime.messages.dispatch('create_todo', { title: 'milk' }),
    )
    await new Promise(resolve => setTimeout(resolve, 0))
    // Whoever changes the Model must not receive the predicate's error.
    expect(() => state.set(withTitle('milk'))).not.toThrow()
    const exit = await pending

    expect(exit._tag === 'Failure' && Cause.hasDies(exit.cause)).toBe(true)
    expect(state.listeners.size).toBe(0)
  })

  it('releases its listener when the caller stops waiting', async () => {
    const state = makeStateHost()
    const runtime = Agent.bind({ definition: creating(), host: state.host })

    await Effect.runPromiseExit(
      Effect.timeout(
        runtime.messages.dispatch('create_todo', { title: 'milk' }),
        Duration.millis(20),
      ),
    )

    expect(state.dispatched).toHaveLength(1)
    expect(state.listeners.size).toBe(0)
  })

  it('is refused at bind when the host cannot subscribe, naming the capability', () => {
    expect(() =>
      Agent.bind({
        definition: creating(),
        host: { model: () => emptyModel, dispatch: (_: Message) => {} },
      }),
    ).toThrow(/cannot subscribe to Model changes, which "create_todo"/)
  })

  it('reads a source outside the Model, which needs no host subscription', async () => {
    let count = 0
    const listeners = new Set<() => void>()
    const source = {
      get: () => count,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    const bump = (): void => {
      count += 1
      for (const listener of [...listeners]) listener()
    }
    const runtime = Agent.bind({
      definition: Agent.make({
        messages: Agent.expose(MessageUnion, {
          RequestedCreateTodo: {
            name: 'create_todo',
            description: 'Create a todo',
            completion: Agent.when({ source, predicate: value => value >= 2 }),
          },
        }),
      }),
      host: { model: () => emptyModel, dispatch: (_: Message) => {} },
    })

    const pending = run(runtime.messages.dispatch('create_todo', { title: 'milk' }))
    setTimeout(bump, 1)
    setTimeout(bump, 5)

    expect((await pending)._tag).toBe('Success')
    expect(listeners.size).toBe(0)
  })

  it('re-evaluates a source that mutates its value in place', async () => {
    const items: string[] = []
    const listeners = new Set<() => void>()
    const source = {
      get: () => items,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    const runtime = Agent.bind({
      definition: Agent.make({
        messages: Agent.expose(MessageUnion, {
          RequestedCreateTodo: {
            name: 'create_todo',
            description: 'Create a todo',
            completion: Agent.when({
              source,
              predicate: (value, request: { readonly title: string }) =>
                value.includes(request.title),
              timeout: '1 second',
            }),
          },
        }),
      }),
      host: { model: () => emptyModel, dispatch: (_: Message) => {} },
    })

    const pending = run(runtime.messages.dispatch('create_todo', { title: 'milk' }))
    setTimeout(() => {
      items.push('milk')
      for (const listener of [...listeners]) listener()
    }, 5)

    expect((await pending)._tag).toBe('Success')
  })

  it('does not re-evaluate a value a notification left unchanged', async () => {
    const state = makeStateHost()
    let evaluated = 0
    const runtime = Agent.bind({
      definition: Agent.make({
        messages: Agent.expose(MessageUnion, {
          RequestedCreateTodo: {
            name: 'create_todo',
            description: 'Create a todo',
            completion: Agent.when({
              projection: Projection.fromReader(ModelSchema, (model: Model) => model),
              predicate: (model, request) => {
                evaluated += 1
                return model.todos.some(todo => todo.title === request.title)
              },
            }),
          },
        }),
      }),
      host: state.host,
    })

    const pending = run(runtime.messages.dispatch('create_todo', { title: 'milk' }))
    await new Promise(resolve => setTimeout(resolve, 1))
    const before = evaluated
    for (const listener of [...state.listeners]) listener()
    for (const listener of [...state.listeners]) listener()
    expect(evaluated).toBe(before)

    state.set(withTitle('milk'))
    expect((await pending)._tag).toBe('Success')
    expect(evaluated).toBe(before + 1)
  })

  it('stops waiting on abort and releases its listener', async () => {
    const state = makeStateHost()
    const controller = new AbortController()
    const runtime = Agent.bind({ definition: creating(), host: state.host })

    const pending = run(
      runtime.messages.dispatch('create_todo', { title: 'milk' }, { signal: controller.signal }),
    )
    await new Promise(resolve => setTimeout(resolve, 1))
    controller.abort()

    expect(((await pending) as { failure: unknown }).failure).toMatchObject({
      _tag: 'AgentCancelledError',
      dispatched: true,
    })
    expect(state.listeners.size).toBe(0)
  })

  it('settles concurrent invocations each on its own condition', async () => {
    const state = makeStateHost()
    const runtime = Agent.bind({ definition: creating(Duration.seconds(1)), host: state.host })

    let milkSettled = false
    const milk = run(runtime.messages.dispatch('create_todo', { title: 'milk' })).finally(() => {
      milkSettled = true
    })
    const bread = run(runtime.messages.dispatch('create_todo', { title: 'bread' }))
    await new Promise(resolve => setTimeout(resolve, 1))

    state.set(withTitle('bread'))
    expect((await bread)._tag).toBe('Success')
    expect(milkSettled).toBe(false)

    state.set(withTitle('milk'))
    expect((await milk)._tag).toBe('Success')
    expect(state.listeners.size).toBe(0)
  })

  it('never subscribes for an invocation that was refused', async () => {
    const state = makeStateHost()
    const runtime = Agent.bind({
      definition: Agent.make({
        messages: Agent.expose(MessageUnion, {
          RequestedCreateTodo: {
            name: 'create_todo',
            description: 'Create a todo',
            authorize: () => false,
            completion: Agent.when({ projection: Todos, predicate: () => true }),
          },
        }),
      }),
      host: state.host,
    })

    const result = await run(runtime.messages.dispatch('create_todo', { title: 'milk' }))

    expect((result as { failure: { _tag: string } }).failure._tag).toBe('AgentAuthorizationError')
    expect(state.listeners.size).toBe(0)
  })

  it('releases its listener when the host returns a failing Effect', async () => {
    const state = makeStateHost()
    const runtime = Agent.bind({
      definition: creating(),
      host: { ...state.host, dispatch: (_: Message) => Effect.fail('refused') },
    })

    const exit = await Effect.runPromiseExit(
      runtime.messages.dispatch('create_todo', { title: 'milk' }),
    )

    expect(exit._tag === 'Failure' && Cause.hasDies(exit.cause)).toBe(true)
    expect(state.listeners.size).toBe(0)
  })
})

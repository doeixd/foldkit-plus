/**
 * `Agent.headless`: the application's own `init`, `update`, Commands and
 * Subscriptions, run with no view, as the host an agent binds to.
 */
import { Effect, Schema } from 'effect'
import { Projection } from 'foldkit-surface'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Agent } from '../src/index.js'
import {
  Message,
  type Model,
  initial,
  recordingStore,
  subscriptions,
  tickerOf,
  update,
} from './hostApp.js'

const running: Array<{ readonly dispose: () => Promise<void> }> = []
afterEach(async () => {
  await Promise.all(running.splice(0).map(app => app.dispose()))
})

const start = (store = recordingStore(), ticker = subscriptions) => {
  const app = Agent.headless({
    init: () => ({ model: initial }),
    update,
    subscriptions: ticker,
    resources: store.layer,
  })
  running.push(app)
  return { ...app, store }
}

/** Resolves once `predicate` holds of the Model, checked after every change. */
const until = (host: Agent.RuntimeHost<Model, Message>, predicate: (model: Model) => boolean) =>
  new Promise<Model>(resolve => {
    const check = () => {
      if (!predicate(host.model())) return
      stop()
      resolve(host.model())
    }
    const stop = host.subscribe(check)
    check()
  })

describe('Agent.headless', () => {
  it('starts from init, and a dispatch resolves once update has applied it', async () => {
    const { host } = start()
    expect(host.model()).toBe(initial)
    await host.dispatch(Message.Incremented())
    expect(host.model().count).toBe(1)
  })

  it('runs a Command with the resources, and applies the Message it produces', async () => {
    const { host, store } = start()
    await host.dispatch(Message.RequestedSave({ title: 'milk' }))
    expect((await until(host, model => model.saved.length > 0)).saved).toEqual(['MILK'])
    await host.dispatch(Message.RequestedSave({ title: 'eggs' }))
    await until(host, model => model.saved.length > 1)
    // One build for the runtime's life, not one per Command.
    expect(store.events).toEqual(['built'])
  })

  it('runs init Commands', async () => {
    const app = Agent.headless({
      init: () => update(initial, Message.RequestedSave({ title: 'boot' })),
      update,
      resources: recordingStore().layer,
    })
    running.push(app)
    expect((await until(app.host, model => model.saved.length > 0)).saved).toEqual(['BOOT'])
  })

  it('restarts a Subscription when its dependencies change, and only then', async () => {
    const starts: Array<boolean> = []
    const { host } = start(recordingStore(), tickerOf(starts))
    await host.dispatch(Message.ToggledTicking())
    await until(host, model => model.ticks === 3)
    // A change the dependencies do not read leaves the stream alone.
    await host.dispatch(Message.Incremented())
    await host.dispatch(Message.ToggledTicking())
    await vi.waitFor(() => expect(starts.at(-1)).toBe(false))
    expect(starts).toEqual([false, true, false])
  })

  it('tells observe of every applied Message, and subscribe only of a changed Model', async () => {
    const { host } = start()
    const observed: Array<string> = []
    let changes = 0
    host.observe(message => observed.push(message._tag))
    host.subscribe(() => changes++)
    await host.dispatch(Message.Noted())
    await host.dispatch(Message.Incremented())
    await host.dispatch(Message.RequestedSave({ title: 'a' }))
    await until(host, model => model.saved.length > 0)
    expect(observed).toEqual(['Noted', 'Incremented', 'RequestedSave', 'Saved'])
    expect(changes).toBe(2)
  })

  it('applies a Message dispatched from a listener after the one being applied', async () => {
    const { host } = start()
    const seen: Array<number> = []
    let again = Promise.resolve()
    host.observe(message => {
      seen.push(host.model().count)
      if (message._tag === 'Incremented' && host.model().count === 1)
        again = host.dispatch(Message.Incremented())
    })
    await host.dispatch(Message.Incremented())
    await again
    expect(seen).toEqual([1, 2])
  })

  it('crashes on a throwing update: it rejects that dispatch and every later one, and releases', async () => {
    const { host, store } = start()
    await host.dispatch(Message.RequestedSave({ title: 'a' }))
    await until(host, model => model.saved.length > 0)
    await expect(host.dispatch(Message.Exploded())).rejects.toThrow(/crashed.*update exploded/s)
    await expect(host.dispatch(Message.Incremented())).rejects.toThrow(/crashed.*update exploded/s)
    await vi.waitFor(() => expect(store.events).toEqual(['built', 'released']))
  })

  it('crashes on a Command that dies', async () => {
    const { host } = start()
    await host.dispatch(Message.RequestedDefect())
    await vi.waitFor(() =>
      expect(host.dispatch(Message.Noted())).rejects.toThrow(/crashed.*the Command died/s),
    )
  })

  it('refuses an interruptible Command, whose registry a headless runtime cannot have', async () => {
    const { host } = start()
    await host.dispatch(Message.RequestedInterruptible())
    await vi.waitFor(() =>
      expect(host.dispatch(Message.Noted())).rejects.toThrow(/interruptible Command Waits/),
    )
  })

  it('keeps applying Messages when a listener throws, and reports the throw on its own', async () => {
    const thrown: Array<unknown> = []
    vi.stubGlobal('queueMicrotask', (task: () => void) => {
      try {
        task()
      } catch (error) {
        thrown.push(error)
      }
    })
    try {
      const { host } = start()
      host.subscribe(() => {
        throw new Error('listener failed')
      })
      await host.dispatch(Message.Incremented())
      await host.dispatch(Message.Incremented())
      expect(host.model().count).toBe(2)
      expect(thrown).toEqual([new Error('listener failed'), new Error('listener failed')])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('stops on dispose: a later dispatch rejects and the resources are released', async () => {
    const { host, store, dispose } = start()
    await host.dispatch(Message.RequestedSave({ title: 'a' }))
    await until(host, model => model.saved.length > 0)
    await dispose()
    expect(store.events).toEqual(['built', 'released'])
    await expect(host.dispatch(Message.Incremented())).rejects.toThrow(/was disposed/)
    expect(host.model().saved).toEqual(['A'])
  })

  it('is a host an agent binds to, completing on the Message the Command produces', async () => {
    const { host } = start()
    const HostAgent = Agent.forModel<Model>()
    const definition = HostAgent.make({
      context: Projection.fromReader(
        Schema.Struct({ saved: Schema.Array(Schema.String) }),
        model => ({
          saved: model.saved,
        }),
      ),
      messages: HostAgent.expose(Message, {
        RequestedSave: Agent.variant({
          description: 'Save a title',
          input: Schema.Struct({ title: Schema.String }),
          toMessage: ({ title }) => ({ title }),
          completion: {
            success: Message.Saved,
            correlate: (request, result) => result.title === request.title.toUpperCase(),
          },
        }),
      }),
    })
    const agent = HostAgent.bind({ definition, host })
    const result = await Effect.runPromise(
      agent.messages.dispatch(Message.RequestedSave, { title: 'milk' }),
    )
    expect(result.completion).toEqual({
      status: 'completed',
      message: Message.Saved({ title: 'MILK' }),
    })
    expect(await Effect.runPromise(agent.context)).toEqual({ saved: ['MILK'] })
  })
})

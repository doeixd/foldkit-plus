// @vitest-environment jsdom
/**
 * `Agent.host` over the real Foldkit runtime: the host reads the Model the
 * runtime committed and sends Messages into its queue, so an agent's Message
 * runs its Commands and Subscriptions as a click's does.
 */
import { Effect, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Projection } from 'foldkit-surface'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Agent } from '../src/index.js'
import { Message, Model, initial, recordingStore, subscriptions, update } from './hostApp.js'

const handles: Array<{ readonly dispose: () => void }> = []
afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose()
  document.body.innerHTML = ''
})

const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      h.button([h.Id('increment'), h.OnClick(Message.Incremented())], ['+']),
      h.span([h.Id('count')], [String(model.count)]),
    ],
  )

const configFor = (crash?: { readonly report: (context: { readonly error: Error }) => void }) => {
  const container = document.createElement('div')
  // The runtime fails before rendering when its container has no id.
  container.id = 'agent-host'
  document.body.appendChild(container)
  return Agent.host({
    Model,
    // A new Model per boot, as a decoded or restored one is.
    init: () => ({ model: { ...initial } }),
    update,
    view,
    subscriptions,
    resources: recordingStore().layer,
    container,
    ...(crash === undefined ? {} : { crash }),
  })
}

const embed = (config: ReturnType<typeof configFor>['config']) => {
  const handle = Runtime.embed(Runtime.makeElement(config))
  handles.push(handle)
  return handle
}

/** Resolves once `predicate` holds of the Model the host reads. */
const until = (host: Agent.RuntimeHost<Model, Message>, predicate: (model: Model) => boolean) =>
  vi.waitFor(() => expect(predicate(host.model())).toBe(true))

describe('Agent.host', () => {
  it('reads nothing before the runtime boots, then the Model it booted with', async () => {
    const { config, host } = configFor()
    expect(() => host.model()).toThrow(/has not started/)
    await expect(host.dispatch(Message.Incremented())).rejects.toThrow(/has not started/)
    embed(config)
    await until(host, model => model.count === 0)
  })

  it('dispatches into the runtime: the Message is applied, its Command runs, the page draws it', async () => {
    const { config, host } = configFor()
    embed(config)
    await until(host, () => true)
    await host.dispatch(Message.Incremented())
    expect(host.model().count).toBe(1)
    await host.dispatch(Message.RequestedSave({ title: 'milk' }))
    await until(host, model => model.saved.length > 0)
    expect(host.model().saved).toEqual(['MILK'])
    await vi.waitFor(() => expect(document.getElementById('count')?.textContent).toBe('1'))
  })

  it('sees what the page and the Subscriptions send, as well as its own dispatches', async () => {
    const { config, host } = configFor()
    embed(config)
    await until(host, () => true)
    const observed: Array<string> = []
    let changes = 0
    host.observe(message => observed.push(message._tag))
    host.subscribe(() => changes++)
    document.getElementById('increment')!.click()
    await host.dispatch(Message.Noted())
    await host.dispatch(Message.ToggledTicking())
    await until(host, model => model.ticks === 3)
    expect(observed).toEqual([
      'Incremented',
      'Noted',
      'ToggledTicking',
      'Ticked',
      'Ticked',
      'Ticked',
    ])
    // `Noted` changed nothing, so it told `subscribe` nothing.
    expect(changes).toBe(5)
  })

  it('rejects a dispatch the runtime stopped before applying, and every dispatch after', async () => {
    const { config, host } = configFor()
    const handle = embed(config)
    await until(host, () => true)
    // Delivery crosses a Subscription, so it is still queued when dispose runs.
    const sent = host.dispatch(Message.Incremented())
    handle.dispose()
    await expect(sent).rejects.toThrow(/stopped/)
    await expect(host.dispatch(Message.Incremented())).rejects.toThrow(/stopped/)
    expect(host.model().count).toBe(0)
  })

  it('hosts the next runtime started from the same config, which never sees the last one’s Messages', async () => {
    const { config, host } = configFor()
    const first = embed(config)
    await until(host, () => true)
    // Queued in the first runtime when it stops, so never applied there.
    const lost = host.dispatch(Message.Incremented())
    first.dispose()
    await expect(lost).rejects.toThrow(/stopped/)
    // Disposed before its Subscriptions start, this one never reports stopping.
    embed(config).dispose()
    embed(config)
    await vi.waitFor(() => host.dispatch(Message.ToggledTicking()))
    expect(host.model()).toEqual({ ...initial, ticking: true })
  })

  it('refuses a second runtime started from the same config while the first runs', async () => {
    const { config, host } = configFor()
    embed(config)
    await until(host, () => true)
    // Foldkit logs a failed boot through Effect's logger.
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {})
    const other = document.createElement('div')
    other.id = 'agent-host-other'
    document.body.appendChild(other)
    embed({ ...config, container: other })
    await vi.waitFor(() =>
      expect(logged.mock.calls.flat().map(String).join(' ')).toMatch(/second runtime was started/),
    )
    await host.dispatch(Message.Incremented())
    expect(host.model().count).toBe(1)
  })

  it('hosts the first of two runtimes started from one config at once, and refuses the second', async () => {
    const reported: Array<string> = []
    const { config, host } = configFor({ report: ({ error }) => reported.push(error.message) })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const other = document.createElement('div')
    other.id = 'agent-host-other'
    document.body.appendChild(other)
    embed(config)
    embed({ ...config, container: other })
    await vi.waitFor(() => expect(reported).toEqual([expect.stringMatching(/second runtime/)]))
    await host.dispatch(Message.Incremented())
    expect(host.model().count).toBe(1)
    await vi.waitFor(() => expect(document.getElementById('count')?.textContent).toBe('1'))
  })

  it('says a runtime that crashed crashed, after it is disposed too', async () => {
    const { config, host } = configFor({ report: () => {} })
    const handle = embed(config)
    await until(host, () => true)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(host.dispatch(Message.Exploded())).rejects.toThrow(/crashed/)
    handle.dispose()
    await expect(host.dispatch(Message.Incremented())).rejects.toThrow(/crashed/)
  })

  it('stops on a crash, rejecting that dispatch, and still calls the application’s report', async () => {
    const reported: Array<string> = []
    const { config, host } = configFor({ report: ({ error }) => reported.push(error.message) })
    embed(config)
    await until(host, () => true)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(host.dispatch(Message.Exploded())).rejects.toThrow(/crashed/)
    await expect(host.dispatch(Message.Incremented())).rejects.toThrow(/crashed/)
    expect(reported).toEqual(['update exploded'])
  })

  it('takes a replay of an older Model for what it is: not a commit', async () => {
    const { config, host } = configFor()
    embed(config)
    await until(host, () => true)
    await host.dispatch(Message.Incremented())
    const observed: Array<string> = []
    host.observe(message => observed.push(message._tag))
    // What DevTools' time travel does with a recorded entry.
    config.update(initial, Message.Incremented())
    expect(observed).toEqual([])
    expect(host.model().count).toBe(1)
  })

  it('refuses a config that is already hosted', () => {
    const { config } = configFor()
    expect(() => Agent.host(config)).toThrow(/already hosted/)
  })

  it('is a host an agent binds to', async () => {
    const { config, host } = configFor()
    embed(config)
    await until(host, () => true)
    const HostAgent = Agent.forModel<Model>()
    const definition = HostAgent.make({
      context: Projection.fromReader(Schema.Struct({ count: Schema.Number }), model => ({
        count: model.count,
      })),
      messages: HostAgent.expose(Message, {
        Incremented: 'Add one',
        RequestedSave: {
          description: 'Save a title',
          completion: Agent.when({
            projection: Projection.fromReader(
              Schema.Array(Schema.String),
              (model: Model) => model.saved,
            ),
            predicate: (saved, request) => saved.includes(request.title.toUpperCase()),
          }),
        },
      }),
    })
    const agent = HostAgent.bind({ definition, host })
    await Effect.runPromise(agent.messages.dispatch(Message.Incremented, {}))
    const saved = await Effect.runPromise(
      agent.messages.dispatch(Message.RequestedSave, { title: 'milk' }),
    )
    expect(saved.completion).toEqual({ status: 'completed' })
    expect(await Effect.runPromise(agent.context)).toEqual({ count: 1 })
  })
})

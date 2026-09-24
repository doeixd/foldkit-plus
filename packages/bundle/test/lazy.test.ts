// @vitest-environment jsdom
/**
 * `Bundle.lazy`: the bodies load on the first Message, which is not lost,
 * the view shows `while` until then, and once loaded the bundle is an
 * ordinary one, on the real Foldkit runtime.
 */
import { Effect, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import * as Submodel from 'foldkit/submodel'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Bundle, Link } from '../src/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const ClickerModel = Schema.Struct({ count: Schema.Number })
type ClickerModel = typeof ClickerModel.Type
const ClickerMessage = defineMessageUnion({ Clicked: {}, Reset: {} })
type ClickerMessage = typeof ClickerMessage.Type

/** The bodies, as a chunk would export them. */
const body: Bundle.Body<ClickerModel, ClickerMessage, void, never, never, void> = {
  update: (model, message) => ({
    model: { count: message._tag === 'Clicked' ? model.count + 1 : 0 },
  }),
  view: Submodel.defineView<ClickerModel, ClickerMessage>((model, h) =>
    h.button([h.Class('count'), h.OnClick(ClickerMessage.Clicked())], [String(model.count)]),
  ),
}

/** A load the test releases, so what happens before it resolves is observable. */
const deferred = () => {
  let release: () => void = () => {}
  const loads: Array<number> = []
  const load = () =>
    new Promise<typeof body>(resolve => {
      loads.push(loads.length)
      release = () => resolve(body)
    })
  return { load, release: () => release(), loads }
}

const makeClicker = (load: () => Promise<typeof body>) =>
  Bundle.lazy(
    {
      name: 'Clicker',
      Model: ClickerModel,
      Message: ClickerMessage,
      init: () => ({ model: { count: 0 } }),
      // What shows until the bodies load; its handler is what asks for them.
      while: Submodel.defineView<ClickerModel, ClickerMessage>((_model, h) =>
        h.button([h.Class('count'), h.OnClick(ClickerMessage.Clicked())], ['…']),
      ),
    },
    load,
  )

describe('before the bodies load', () => {
  it('keeps the Model and returns the Command that loads them and yields the Message again', async () => {
    const { load, release, loads } = deferred()
    const Clicker = makeClicker(load)
    const step = Clicker.update({ count: 3 }, ClickerMessage.Clicked(), undefined)
    expect(step.model).toEqual({ count: 3 })
    expect(step.commands).toHaveLength(1)
    const [command] = step.commands ?? []
    if (command === undefined) throw new Error('no Command')
    expect(command.name).toBe('LoadClicker')
    expect(Clicker.isLoaded()).toBe(false)
    const running = Effect.runPromise(command.effect)
    release()
    expect(await running).toEqual(ClickerMessage.Clicked())
    expect(Clicker.isLoaded()).toBe(true)
    // Loaded once, whatever asked for it.
    await Clicker.load()
    expect(loads).toEqual([0])
    expect(Clicker.update({ count: 3 }, ClickerMessage.Clicked(), undefined)).toEqual({
      model: { count: 4 },
    })
  })

  it('loads on demand through load(), once', async () => {
    const { load, release, loads } = deferred()
    const Clicker = makeClicker(load)
    const first = Clicker.load()
    expect(Clicker.load()).toBe(first)
    release()
    await first
    expect(loads).toEqual([0])
    expect(Clicker.isLoaded()).toBe(true)
  })
})

const GotClickerMessage = Link.wrapper('GotClickerMessage', ClickerMessage)
const Model = Schema.Struct({ clicker: ClickerModel })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...GotClickerMessage.cases })
type Message = typeof Message.Type

const text = (selector: string) => document.querySelector(selector)?.textContent
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click()

it('shows `while`, loads on the first click, and counts that click', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'lazy-runtime'
  document.body.appendChild(container)
  const { load, release } = deferred()
  const Clicker = makeClicker(load)
  const Placed = Clicker.at(Link.field<Model>()('clicker', GotClickerMessage))
  const placements = Bundle.assemble<Model, Message>()([Placed])

  const program = Runtime.makeElement(
    placements.complete({
      Model,
      container,
      init: () => placements.init({ clicker: { count: 0 } }),
      update: placements.update(),
      view: (model: Model, h: HtmlBuilder<Message>) => h.main([], [Placed.view(model, h)]),
      subscriptions: placements.subscriptions(),
    }),
  )
  const handle = Runtime.embed(program)
  try {
    await vi.waitFor(() => expect(text('.count')).toBe('…'))
    click('.count')
    // The bodies are on their way; the click waits with them.
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(text('.count')).toBe('…')
    expect(Clicker.isLoaded()).toBe(false)
    release()
    await vi.waitFor(() => expect(text('.count')).toBe('1'))
    click('.count')
    await vi.waitFor(() => expect(text('.count')).toBe('2'))
  } finally {
    handle.dispose()
  }
})

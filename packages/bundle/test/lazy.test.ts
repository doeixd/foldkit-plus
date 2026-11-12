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

/** The page on the real runtime; the clicker is placed in `main`. */
const mount = (Clicker: ReturnType<typeof makeClicker>) => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'lazy-runtime'
  document.body.appendChild(container)
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
  return Runtime.embed(program)
}

it('shows `while`, loads on the first click, and counts that click', async () => {
  const { load, release } = deferred()
  const Clicker = makeClicker(load)
  const handle = mount(Clicker)
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

/** Bodies whose update returns the Model it was given, as a page's `Arrived` Message does. */
const quiet = {
  update: (model: ClickerModel) => ({ model }),
  view: Submodel.defineView<ClickerModel, ClickerMessage>((_model, h) =>
    h.button([h.Class('count'), h.OnClick(ClickerMessage.Clicked())], ['loaded']),
  ),
} as unknown as typeof body

describe('arrival (#501)', () => {
  it('draws the bodies when the first Message leaves the Model as it was', async () => {
    const Clicker = makeClicker(async () => quiet)
    const handle = mount(Clicker)
    try {
      await vi.waitFor(() => expect(text('.count')).toBe('…'))
      click('.count')
      await vi.waitFor(() => expect(text('.count')).toBe('loaded'))
    } finally {
      handle.dispose()
    }
  })

  it('draws bodies a bare load() brought, at the next Message', async () => {
    const { load, release } = deferred()
    const Clicker = makeClicker(() => load().then(() => quiet))
    const handle = mount(Clicker)
    try {
      await vi.waitFor(() => expect(text('.count')).toBe('…'))
      const loading = Clicker.load()
      release()
      await loading
      click('.count')
      await vi.waitFor(() => expect(text('.count')).toBe('loaded'))
    } finally {
      handle.dispose()
    }
  })

  it('returns the Model it was given once the arrival is drawn', async () => {
    const Clicker = makeClicker(async () => quiet)
    await Clicker.load()
    const model = { count: 1 }
    expect(Clicker.update(model, ClickerMessage.Clicked(), undefined).model).toBe(model)
  })
})

describe('a load that fails (#502)', () => {
  it('is no crash: `while` stays, and the next Message tries again', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const attempts: Array<number> = []
    const Clicker = makeClicker(async () => {
      attempts.push(attempts.length)
      if (attempts.length === 1) throw new Error('chunk 404')
      return body
    })
    const handle = mount(Clicker)
    try {
      await vi.waitFor(() => expect(text('.count')).toBe('…'))
      click('.count')
      await vi.waitFor(() => expect(attempts).toEqual([0]))
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(text('.count')).toBe('…')
      expect(Clicker.isLoaded()).toBe(false)
      click('.count')
      await vi.waitFor(() => expect(text('.count')).toBe('1'))
      expect(attempts).toEqual([0, 1])
    } finally {
      handle.dispose()
      log.mockRestore()
    }
  })

  it('rejects load() and lets the next load() try again', async () => {
    let first = true
    const Clicker = makeClicker(async () => {
      if (first) {
        first = false
        throw new Error('chunk 404')
      }
      return body
    })
    await expect(Clicker.load()).rejects.toThrow('chunk 404')
    await Clicker.load()
    expect(Clicker.isLoaded()).toBe(true)
  })
})

describe('arrival over a kept drawing (#511)', () => {
  const GotCount = Link.wrapper('GotCount', ClickerMessage)
  const PrimitiveModel = Schema.Struct({ c: Schema.Number, other: Schema.Number })
  type PrimitiveModel = typeof PrimitiveModel.Type
  const PrimitiveMessage = defineMessageUnion({ ...GotCount.cases, Poked: {} })

  const tell = (word: string) =>
    Submodel.defineView<number, ClickerMessage>((_model, h) =>
      h.button([h.Class('count'), h.OnClick(ClickerMessage.Clicked())], [word]),
    )
  const Counted = (
    load: () => Promise<Bundle.Body<number, ClickerMessage, void, never, never, void>>,
  ) =>
    Bundle.lazy(
      {
        name: 'Counted',
        Model: Schema.Number,
        Message: ClickerMessage,
        init: () => ({ model: 0 }),
        while: tell('…'),
      },
      load,
    )

  it('draws the bodies of a primitive Model on the next render of the parent', async () => {
    const Clicker = Counted(async () => ({ update: model => ({ model }), view: tell('loaded') }))
    const Placed = Clicker.at(Link.field<PrimitiveModel>()('c', GotCount))
    const placements = Bundle.assemble<PrimitiveModel, typeof PrimitiveMessage.Type>()([Placed])
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    const container = document.createElement('div')
    container.id = 'lazy-primitive'
    document.body.appendChild(container)
    const handle = Runtime.embed(
      Runtime.makeElement(
        placements.complete({
          Model: PrimitiveModel,
          container,
          init: () => placements.init({ c: 0, other: 0 }),
          update: placements.update((model, message) =>
            message._tag === 'Poked' ? { model: { ...model, other: model.other + 1 } } : { model },
          ),
          view: (model: PrimitiveModel, h: HtmlBuilder<typeof PrimitiveMessage.Type>) =>
            h.main(
              [],
              [
                h.button(
                  [h.Class('poke'), h.OnClick(PrimitiveMessage.Poked())],
                  [String(model.other)],
                ),
                Placed.view(model, h),
              ],
            ),
          subscriptions: placements.subscriptions(),
        }),
      ),
    )
    try {
      await vi.waitFor(() => expect(text('.count')).toBe('…'))
      click('.count')
      await vi.waitFor(() => expect(Clicker.isLoaded()).toBe(true))
      click('.poke')
      await vi.waitFor(() => expect(text('.poke')).toBe('1'))
      await vi.waitFor(() => expect(text('.count')).toBe('loaded'))
    } finally {
      handle.dispose()
    }
  })
})

it('keeps the class of an instance Model in the copy that draws the arrival (#511)', async () => {
  class Box {
    constructor(readonly n: number) {}
    get double() {
      return this.n * 2
    }
  }
  const view = Submodel.defineView<Box, ClickerMessage>(() => null)
  const L = Bundle.lazy(
    {
      name: 'Boxed',
      Model: Schema.instanceOf(Box),
      Message: ClickerMessage,
      init: () => ({ model: new Box(1) }),
      while: view,
    },
    async () => ({ update: (model: Box) => ({ model }), view }),
  )
  const given = new Box(2)
  ;(L.view as any)(given, {})
  await L.load()
  const after = L.update(given, ClickerMessage.Clicked(), undefined).model
  expect(after).not.toBe(given)
  expect(after).toBeInstanceOf(Box)
  expect((after as Box).double).toBe(4)
})

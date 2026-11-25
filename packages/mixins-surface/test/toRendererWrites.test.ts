// @vitest-environment jsdom
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { Projection, Surface } from 'foldkit-surface'
import { Writes } from 'foldkit-surface/writes'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SurfaceView } from '../src/index.js'

const Model = Schema.Struct({
  count: Schema.Int,
  note: Schema.String,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  Inc: {},
  SetNote: { text: Schema.String },
})
type Message = typeof Message.Type

const App = Surface.application({ Model, Message })

const initial: Model = { count: 0, note: '' }

const rawUpdate = (model: Model, message: Message): { readonly model: Model } =>
  Message.match(message, {
    Inc: () => ({ model: { ...model, count: model.count + 1 } }),
    SetNote: ({ text }) => ({ model: { ...model, note: text } }),
  })

const emptyMachine = {
  stateSchema: Model,
  transitions: {},
  footprints: {},
  dispatch: () => {
    throw new Error('unused')
  },
  update: () => {
    throw new Error('unused')
  },
}

const writers = {
  Inc: [['count']],
  SetNote: [['note']],
}

const CounterSurface = Surface.make(App, 'Counter', {
  model: ({ model }) => Projection.struct({ count: model.count }),
  messages: [Message.Inc],
})

const CounterSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
})

const waitFrame = () => new Promise<void>(resolve => setTimeout(resolve, 10))

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('SurfaceView.toRenderer under writes.install() & SlotView.region pathEpoch (Bout 2.2)', () => {
  it('keeps an unchanged Surface drawing through SurfaceView.toRenderer when writes.install() is active', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)

    const writes = Writes.of(App, emptyMachine, { writers })
    const tracked = writes.track(rawUpdate)
    const dispose = writes.install()

    const container = document.createElement('div')
    container.id = 'to-renderer-writes'
    document.body.appendChild(container)

    let draws = 0
    const counterView = SurfaceView.define(CounterSurface, CounterSlots, (model, slots, h) => {
      draws += 1
      return h.div([h.Id('counter'), ...slots.root.attrs()], [String(model.count)])
    })
    const rootView = Surface.rootView(
      CounterSurface,
      undefined,
      SurfaceView.toRenderer(counterView),
    )

    const handle = Runtime.embed(
      Runtime.makeElement({
        Model,
        container,
        init: () => ({ model: initial }),
        update: (model: Model, message: Message) => ({
          model: tracked(model, message).model,
          commands: [],
        }),
        view: (model: Model, h: HtmlBuilder<Message>) =>
          h.div(
            [],
            [
              rootView(model, h),
              h.button([h.Id('set-note'), h.OnClick(Message.SetNote({ text: 'hello' }))], ['note']),
              h.button([h.Id('inc'), h.OnClick(Message.Inc())], ['inc']),
            ],
          ),
      }),
    )

    try {
      await waitFrame()
      expect(draws).toBe(1)
      expect(document.getElementById('counter')?.textContent).toBe('0')

      // Unrelated Message (`SetNote`) does NOT redraw CounterSurface through SurfaceView.toRenderer.
      ;(document.getElementById('set-note') as HTMLElement).click()
      await waitFrame()
      expect(draws).toBe(1)
      expect(document.getElementById('counter')?.textContent).toBe('0')

      // Related Message (`Inc`) DOES redraw CounterSurface.
      ;(document.getElementById('inc') as HTMLElement).click()
      await waitFrame()
      expect(draws).toBe(2)
      expect(document.getElementById('counter')?.textContent).toBe('1')
    } finally {
      handle.dispose()
      dispose()
    }
  })

  it('skips SlotView.region reads while pathEpoch is unchanged', () => {
    const writes = Writes.of(App, emptyMachine, { writers })
    const update = writes.track(rawUpdate)

    let readsCount = 0
    const counterReads = {
      dependencies: [['count']] as const,
      read: (root: Model) => {
        readsCount += 1
        return root.count
      },
    }
    const region = SlotView.region(
      counterReads,
      (
        count,
        slots: SlotView.SlotBuilders<typeof CounterSlots, Message>,
        h: HtmlBuilder<Message>,
      ) => h.div(slots.root.attrs(), [String(count)]),
      { pathEpoch: writes.epochFor([['count']]) },
    )
    const pageView = SlotView.define(CounterSlots, (model: Model, slots, h: HtmlBuilder<Message>) =>
      region(model, slots, h),
    )

    const h = SlotView.inertBuilder<Message>()
    const m0 = initial
    pageView(m0, h)
    expect(readsCount).toBe(1)

    const m1 = update(m0, Message.SetNote({ text: 'x' })).model
    pageView(m1, h)
    const m2 = update(m1, Message.SetNote({ text: 'y' })).model
    pageView(m2, h)
    // Unchanged epoch across both unrelated Messages -> 0 additional reads!
    expect(readsCount).toBe(1)

    const m3 = update(m2, Message.Inc()).model
    pageView(m3, h)
    expect(readsCount).toBe(2)
  })

  it('activates skipping for a Surface.rootView created before writes.install() and restores plain rendering on dispose (Bout 2.6 H2)', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)

    // Create the view at module-definition time, BEFORE writes.install().
    let draws = 0
    const counterView = SurfaceView.define(CounterSurface, CounterSlots, (model, slots, h) => {
      draws += 1
      return h.div([h.Id('counter-late'), ...slots.root.attrs()], [String(model.count)])
    })
    const rootView = Surface.rootView(
      CounterSurface,
      undefined,
      SurfaceView.toRenderer(counterView),
    )

    const writes = Writes.of(App, emptyMachine, { writers })
    const tracked = writes.track(rawUpdate)
    const dispose = writes.install()

    const container = document.createElement('div')
    container.id = 'to-renderer-writes-late'
    document.body.appendChild(container)

    const handle = Runtime.embed(
      Runtime.makeElement({
        Model,
        container,
        init: () => ({ model: initial }),
        update: (model: Model, message: Message) => ({
          model: tracked(model, message).model,
          commands: [],
        }),
        view: (model: Model, h: HtmlBuilder<Message>) =>
          h.div(
            [],
            [
              rootView(model, h),
              h.button(
                [h.Id('set-note-late'), h.OnClick(Message.SetNote({ text: 'hello' }))],
                ['note'],
              ),
            ],
          ),
      }),
    )

    try {
      await waitFrame()
      expect(draws).toBe(1)

      // Late writes.install() took effect -> unrelated SetNote does NOT redraw.
      ;(document.getElementById('set-note-late') as HTMLElement).click()
      await waitFrame()
      expect(draws).toBe(1)

      // Disposing writes.install() restores plain rendering -> next SetNote DOES redraw.
      dispose()
      ;(document.getElementById('set-note-late') as HTMLElement).click()
      await waitFrame()
      expect(draws).toBe(2)
    } finally {
      handle.dispose()
      dispose()
    }
  })
})

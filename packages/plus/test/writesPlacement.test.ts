// @vitest-environment jsdom
/**
 * A Bundle placement kept on `writes.epochFor`, on the real Foldkit runtime:
 * a checkpoint installed without the tracked `update` draws the child again,
 * though no Message declared to write its path ran and no `rootView` drew.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import * as Submodel from 'foldkit/submodel'
import { Bundle, Link } from 'foldkit-bundle'
import { Surface } from 'foldkit-surface'
import { Writes } from 'foldkit-surface/writes'
import { Transition } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const Counter = Schema.Struct({ count: Schema.Number })
type Counter = typeof Counter.Type
const CounterMessage = defineMessageUnion({ Clicked: {} })

let childDraws = 0
const counter = Bundle.make({
  name: 'Counter',
  Model: Counter,
  Message: CounterMessage,
  init: () => ({ model: { count: 0 } }),
  update: (model: Counter) => ({ model: { count: model.count + 1 } }),
  view: Submodel.defineView<Counter, typeof CounterMessage.Type>((model, h) => {
    childDraws++
    return h.span([h.Id('child')], [String(model.count)])
  }),
})

const GotChild = Link.wrapper('GotChild', CounterMessage)
const Model = Schema.Struct({ title: Schema.String, child: Counter })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  Renamed: { title: Schema.String },
  Restored: {},
  ...GotChild.cases,
})
type Message = typeof Message.Type

const App = Surface.application({ Model, Message })
const writes = Writes.of(
  App,
  Machine.make({
    state: Model,
    transitions: {
      Renamed: Transition.make({
        state: Model,
        input: Message.Renamed,
        apply: ({ state, input }) => [Transition.set(state.title, input.title)],
      }),
    },
  }),
)

const Child = counter.at(Link.field<Model>()('child', GotChild), {
  pathEpoch: writes.epochFor([['child']]),
})
const placements = Bundle.assemble<Model, Message>()([Child])

it('draws a placement kept on epochFor again for a restored checkpoint', async () => {
  const checkpoint: Model = { title: 'Saved', child: { count: 42 } }
  const tracked = writes.track(
    placements.update((model, message) => {
      if (message._tag === 'Renamed') return { model: { ...model, title: message.title } }
      return { model }
    }),
  )
  // A restore installs an already-derived Model outside the tracked `update`.
  const update = (model: Model, message: Message) => {
    if (message._tag === 'Restored') return { model: checkpoint }
    return tracked(model, message)
  }

  childDraws = 0
  const container = document.createElement('div')
  container.id = 'writes-placement'
  document.body.appendChild(container)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const handle = Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: () => placements.init({ title: 'Untitled', child: { count: 0 } }),
        update,
        view: (model: Model, h: HtmlBuilder<Message>) =>
          h.main(
            [],
            [
              h.span([h.Id('title')], [model.title]),
              Child.view(model, h),
              h.button([h.Id('rename'), h.OnClick(Message.Renamed({ title: 'Next' }))], ['rename']),
              h.button([h.Id('restore'), h.OnClick(Message.Restored())], ['restore']),
            ],
          ),
        subscriptions: placements.subscriptions(),
        managedResources: placements.resources(),
      }),
    ),
  )
  const text = (id: string) => document.getElementById(id)?.textContent
  try {
    await vi.waitFor(() => expect(text('child')).toBe('0'))
    document.getElementById('rename')!.click()
    await vi.waitFor(() => expect(text('title')).toBe('Next'))
    // A declared write to another path keeps the child's drawing.
    expect(childDraws).toBe(1)
    document.getElementById('restore')!.click()
    await vi.waitFor(() => expect(text('title')).toBe('Saved'))
    expect(text('child')).toBe('42')
    expect(childDraws).toBe(2)
  } finally {
    handle.dispose()
  }
})

// @vitest-environment jsdom
/**
 * `Writes.of` over a Machine composed of one child Machine lifted at two
 * paths (`Machine.compose`): a view over one child is not drawn again by the
 * other child's Message, counted on the real Foldkit runtime.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Num, Path, Transition } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import { afterEach, expect, it, vi } from 'vitest'
import { Surface } from '../src/index.js'
import { Writes } from '../src/writes.js'

const Counter = Schema.Struct({ count: Schema.Number, label: Schema.String })

const Counters = Machine.make({
  state: Counter,
  transitions: {
    Added: Transition.make({
      state: Counter,
      input: Schema.Struct({ amount: Schema.Number }),
      apply: ({ state, input }) => [
        Transition.set(state.count, Num.add(state.count, input.amount)),
      ],
    }),
    Labelled: Transition.make({
      state: Counter,
      input: Schema.Struct({ label: Schema.String }),
      apply: ({ state, input }) => [Transition.set(state.label, input.label)],
    }),
  },
})

const Model = Schema.Struct({ title: Schema.String, left: Counter, right: Counter })
type Model = typeof Model.Type

const Message = defineMessageUnion({
  Renamed: { title: Schema.String },
  LeftAdded: { amount: Schema.Number },
  LeftLabelled: { label: Schema.String },
  RightAdded: { amount: Schema.Number },
  RightLabelled: { label: Schema.String },
})
type Message = typeof Message.Type

const model = Path.from(Model)
const Board = Machine.compose({
  state: Model,
  transitions: {
    Renamed: Transition.make({
      state: Model,
      input: Message.Renamed,
      apply: ({ state, input }) => [Transition.set(state.title, input.title)],
    }),
  },
  children: {
    Left: Machine.lift(model.left, Counters),
    Right: Machine.lift(model.right, Counters),
  },
})

const App = Surface.application({ Model, Message })
const Title = App.surface('Title', { model: ({ model }) => ({ title: model.title }) })
const Left = App.surface('Left', { model: ({ model }) => ({ counter: model.left }) })
const LeftLabel = App.surface('LeftLabel', { model: ({ model }) => ({ label: model.left.label }) })
const Right = App.surface('Right', { model: ({ model }) => ({ counter: model.right }) })

const update = (state: Model, message: Message): { readonly model: Model } => ({
  model: Message.match(message, {
    Renamed: input => Board.update(state, { _tag: 'Renamed', input })[0],
    LeftAdded: input => Board.update(state, { _tag: 'LeftAdded', input })[0],
    LeftLabelled: input => Board.update(state, { _tag: 'LeftLabelled', input })[0],
    RightAdded: input => Board.update(state, { _tag: 'RightAdded', input })[0],
    RightLabelled: input => Board.update(state, { _tag: 'RightLabelled', input })[0],
  }),
})

const initial: Model = {
  title: 'Board',
  left: { count: 0, label: 'left' },
  right: { count: 0, label: 'right' },
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

it('matches each view to the Messages of the child it reads, and to no other child', () => {
  const writes = Writes.of(App, Board)
  writes.rootView(Title, undefined, () => null)
  writes.rootView(Left, undefined, () => null)
  writes.rootView(LeftLabel, undefined, () => null)
  writes.rootView(Right, undefined, () => null)
  expect(writes.regions().map(region => [region.name, region.redrawnBy])).toEqual([
    ['Title', ['Renamed']],
    // Reads the child whole: a write to either field below it.
    ['Left', ['LeftAdded', 'LeftLabelled']],
    // Reads one field: not the write to its sibling `count`.
    ['LeftLabel', ['LeftLabelled']],
    ['Right', ['RightAdded', 'RightLabelled']],
  ])
})

it("keeps one child's drawing through the other child's Message", async () => {
  const writes = Writes.of(App, Board)
  const draws = { Left: 0, LeftLabel: 0, Right: 0 }
  const left = writes.rootView(Left, undefined, ({ counter }, h) => {
    draws.Left++
    return h.p([h.Id('left')], [`${counter.label}: ${counter.count}`])
  })
  const leftLabel = writes.rootView(LeftLabel, undefined, ({ label }, h) => {
    draws.LeftLabel++
    return h.p([h.Id('left-label')], [label])
  })
  const right = writes.rootView(Right, undefined, ({ counter }, h) => {
    draws.Right++
    return h.p([h.Id('right')], [`${counter.label}: ${counter.count}`])
  })
  const senders = {
    'add-left': Message.LeftAdded({ amount: 2 }),
    'add-right': Message.RightAdded({ amount: 5 }),
    'label-left': Message.LeftLabelled({ label: 'port' }),
  }
  const container = document.createElement('div')
  container.id = 'composed'
  document.body.appendChild(container)
  // Frames run on a timer, as jsdom has none.
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const tracked = writes.track(update)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update: (state: Model, message: Message) => ({
        model: tracked(state, message).model,
        commands: [],
      }),
      view: (state: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [],
          [
            left(state, h),
            leftLabel(state, h),
            right(state, h),
            ...Object.entries(senders).map(([id, message]) =>
              h.button([h.Id(id), h.OnClick(message)], [id]),
            ),
          ],
        ),
    }),
  )
  const text = (id: string) => document.getElementById(id)?.textContent
  const press = (id: string) => document.getElementById(id)?.click()
  try {
    await vi.waitFor(() => expect(text('left')).toBe('left: 0'))
    expect(draws).toEqual({ Left: 1, LeftLabel: 1, Right: 1 })

    press('add-right')
    await vi.waitFor(() => expect(text('right')).toBe('right: 5'))
    expect(draws).toEqual({ Left: 1, LeftLabel: 1, Right: 2 })

    press('add-left')
    await vi.waitFor(() => expect(text('left')).toBe('left: 2'))
    expect(draws).toEqual({ Left: 2, LeftLabel: 1, Right: 2 })

    press('label-left')
    await vi.waitFor(() => expect(text('left-label')).toBe('port'))
    expect(draws).toEqual({ Left: 3, LeftLabel: 2, Right: 2 })
    expect(text('right')).toBe('right: 5')
  } finally {
    handle.dispose()
  }
})

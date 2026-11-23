import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Machine from 'metakit/machine'
import { Transition } from 'metakit'
import { describe, expect, it } from 'vitest'
import { Projection, Surface } from '../src/index.js'
import { Writes } from '../src/writes.js'

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

const AppMachine = Machine.make({
  state: Model,
  transitions: {
    Inc: Transition.make({
      state: Model,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.add(state.count, 1)],
    }),
    SetNote: Transition.make({
      state: Model,
      input: Schema.Struct({ text: Schema.String }),
      apply: ({ state, input }) => [Transition.set(state.note, input.text)],
    }),
  },
})

const instrumentCount = (target: Model, onRead: () => void): void => {
  const raw = target.count
  Object.defineProperty(target, 'count', {
    configurable: true,
    enumerable: true,
    get() {
      onRead()
      return raw
    },
  })
}

describe('Projection.derive pathEpoch memo skipping (Bout 2.2)', () => {
  it('skips reading and comparing values across unrelated Messages when pathEpoch is unchanged', () => {
    const writes = Writes.of(App, AppMachine)
    const update = writes.track(rawUpdate)

    const withEpoch = Projection.derive([App.model.count], m => m.count * 2, {
      pathEpoch: writes.epochFor([['count']]),
    })
    const withoutEpoch = Projection.derive([App.model.count], m => m.count * 2)

    // Initial render adopts `initial` and primes both memos.
    const m0 = initial
    expect(withEpoch.read(m0)).toBe(0)
    expect(withoutEpoch.read(m0)).toBe(0)

    let measuring = false
    let countReadsWithEpoch = 0
    let countReadsWithoutEpoch = 0

    // Message 1 writes only `note` (never `count`).
    const m1 = update(m0, Message.SetNote({ text: 'a' })).model
    instrumentCount(m1, () => {
      if (measuring) countReadsWithEpoch += 1
    })
    measuring = true
    expect(withEpoch.read(m1)).toBe(0)
    measuring = false

    // Message 2 writes only `note` again.
    const m2 = update(m1, Message.SetNote({ text: 'b' })).model
    instrumentCount(m2, () => {
      if (measuring) countReadsWithEpoch += 1
    })
    measuring = true
    expect(withEpoch.read(m2)).toBe(0)
    measuring = false

    // Epoch unchanged across both unrelated Messages -> 0 value reads/comparisons.
    expect(countReadsWithEpoch).toBe(0)

    // Without pathEpoch, both reads inspect `count` (2 comparisons).
    const plain1 = { ...m0, note: 'a' }
    const plain2 = { ...plain1, note: 'b' }
    instrumentCount(plain1, () => {
      countReadsWithoutEpoch += 1
    })
    instrumentCount(plain2, () => {
      countReadsWithoutEpoch += 1
    })
    expect(withoutEpoch.read(plain1)).toBe(0)
    expect(withoutEpoch.read(plain2)).toBe(0)
    expect(countReadsWithoutEpoch).toBe(2)

    // Related Message (`Inc`) bumps the epoch and recomputes.
    const m3 = update(m2, Message.Inc()).model
    expect(withEpoch.read(m3)).toBe(2)
    expect(withoutEpoch.read(m3)).toBe(2)
  })
})

import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Machine from '@doeixd/metakit/machine'
import { Transition } from '@doeixd/metakit'
import { describe, expect, it } from 'vitest'
import { Metadata, Projection, Surface } from '../src/index.js'
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

  it('recomputes Projection.derive on wildcard dependency paths instead of indexing literal "*" (Bout 2.6 M1)', () => {
    const TodoModel = Schema.Struct({
      todos: Schema.Array(Schema.Struct({ title: Schema.String })),
    })
    type TodoModel = typeof TodoModel.Type
    const titles = Projection.derive(
      [{ dependencies: [['todos', '*', 'title']] }],
      (m: TodoModel) => m.todos.map(t => t.title),
    )
    expect(titles.read({ todos: [{ title: 'a' }] })).toEqual(['a'])
    expect(titles.read({ todos: [{ title: 'b' }] })).toEqual(['b'])
  })

  it('does not treat a narrower registered writer path as covering a parent metadata read (Bout 2.6 M2)', () => {
    const StoreModel = Schema.Struct({
      remote: Schema.Struct({ entities: Schema.String, meta: Schema.String }),
      other: Schema.String,
    })
    type StoreModel = typeof StoreModel.Type
    const StoreMsg = defineMessageUnion({
      PatchEntities: {},
      PatchOther: {},
    })
    const StoreApp = Surface.application({ Model: StoreModel, Message: StoreMsg })
    const StoreMachine = Machine.make({
      state: StoreModel,
      transitions: {
        PatchOther: Transition.make({
          state: StoreModel,
          input: Schema.Struct({}),
          apply: ({ state }) => [Transition.set(state.other, 'x')],
        }),
      },
    })
    const Asked = Metadata.key<string>('asked', {
      merge: values => values,
      summarize: value => value,
    })
    const WholeRemote = StoreApp.surface('WholeRemote', {
      model: () =>
        Projection.fromReader(Schema.String, (m: StoreModel) => m.remote.meta, {
          dependencies: [['remote']],
          metadata: Asked.of('remote'),
        }),
    })
    const writes = Writes.of(StoreApp, StoreMachine, {
      writers: { PatchEntities: [['remote', 'entities']] },
    })
    writes.rootView(WholeRemote, undefined, () => null)
    const region = writes.regions().find(r => r.name === 'WholeRemote')
    // Narrow writer `['remote', 'entities']` does NOT cover `['remote']`, so reads stays unknown.
    expect(region?.reads).toEqual(Option.none())
  })
})

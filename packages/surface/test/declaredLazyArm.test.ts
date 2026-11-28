import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Num, Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import { describe, expect, it } from 'vitest'
import { Declared } from '../src/declared.js'
import { Surface } from '../src/index.js'

const Model = Schema.Struct({ count: Schema.Int })
type Model = typeof Model.Type

const Message = defineMessageUnion({
  Inc: { by: Schema.Int },
  LazyReset: {},
})

const App = Surface.application({ Model, Message })

const baseMachine = Machine.make({
  state: Model,
  transitions: {
    Inc: Transition.make({
      state: Model,
      input: Schema.Struct({ by: Schema.Int }),
      apply: ({ state, input }) => [Transition.set(state.count, Num.add(state.count, input.by))],
    }),
  },
})

describe('Declared.of dynamic lazy arms (Phase 7 Bout 7.6)', () => {
  it('holds Messages for unloaded lazyTags in FIFO order and runs them once registerArm arrives', () => {
    const declared = Declared.of(App, baseMachine, {
      lazyTags: ['LazyReset'],
      fallback: model => ({ model }),
    })

    let model: Model = { count: 0 }
    model = declared.update(model, Message.Inc({ by: 5 })).model
    expect(model).toEqual({ count: 5 })

    // LazyReset arrives before its chunk: held in waiting queue, model unchanged
    const held = declared.update(model, Message.LazyReset())
    expect(held.model).toBe(model)
    expect(declared.waitingFor('LazyReset')).toEqual([Message.LazyReset()])

    // Chunk arrives and registers the arm
    const resetTransition = Transition.make({
      state: Model,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.set(state.count, 0)],
    })
    const drained = declared.registerArm(
      'LazyReset',
      resetTransition as unknown as Transition.Transition<Model, unknown, unknown, unknown>,
    )
    expect(drained).toEqual([Message.LazyReset()])
    expect(declared.waitingFor('LazyReset')).toEqual([])

    // Draining held Messages applies the newly arrived arm
    for (const msg of drained) {
      model = declared.update(model, msg).model
    }
    expect(model).toEqual({ count: 0 })

    // Subsequent LazyReset dispatches directly through the registered arm
    model = declared.update(model, Message.Inc({ by: 9 })).model
    model = declared.update(model, Message.LazyReset()).model
    expect(model).toEqual({ count: 0 })
  })
})

import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Ord, Path, Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import { describe, expect, it } from 'vitest'
import { Agent } from '../src/index.js'
import { machineTools } from '../src/metakit.js'

const Counter = Schema.Struct({ count: Schema.Int })
const AppModel = Schema.Struct({ left: Counter, right: Counter })
type AppModel = typeof AppModel.Type

const CounterMachine = Machine.make({
  state: Counter,
  transitions: {
    Dec: Transition.make({
      state: Counter,
      input: Schema.Struct({}),
      when: ({ state }) => Ord.gt(state.count, 0),
      apply: ({ state }) => [Transition.add(state.count, -1)],
    }),
  },
})

const Composed = Machine.compose({
  state: AppModel,
  transitions: {},
  children: {
    Left: Machine.lift(Path.from(AppModel).left, CounterMachine),
    Right: Machine.lift(Path.from(AppModel).right, CounterMachine),
  },
})

const Message = defineMessageUnion({
  LeftDec: {},
  RightDec: {},
})

describe('foldkit-agent/metakit machineTools over composed Machine (Bout 3.7)', () => {
  it('derives tools directly from a composed Machine without a state selector when Model === State', () => {
    const AppAgent = Agent.forModel<AppModel>()
    const Tools = machineTools({ agent: AppAgent, machine: Composed })
    const definition = AppAgent.make({
      messages: AppAgent.expose(Message, {
        LeftDec: Tools.LeftDec('Decrement left counter'),
        RightDec: Tools.RightDec('Decrement right counter'),
      }),
    })

    let model: AppModel = { left: { count: 0 }, right: { count: 2 } }
    const runtime = AppAgent.bind({
      definition,
      host: {
        model: () => model,
        principal: () => undefined,
        dispatch: () => {},
      },
    })

    // When left.count === 0 and right.count === 2, only right_dec is available.
    const listed = Effect.runSync(runtime.messages.available)
    expect(listed.map(c => c.name)).toEqual(['right_dec'])
  })
})

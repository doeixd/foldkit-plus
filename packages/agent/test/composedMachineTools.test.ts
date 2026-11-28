import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Ord, Path, Transition } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import * as Language from '@doeixd/metakit/language'
import * as Operation from '@doeixd/metakit/operation'
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

  it('forwards foreign implementations to canDispatch so available respects foreign guards (M6)', () => {
    const isPositive = Operation.define({
      id: 'agent.isPositive',
      version: 1,
      args: [Schema.Int] as const,
      returns: Schema.Boolean,
      nulls: 'strict',
    })
    const ForeignMachine = Machine.make({
      state: Counter,
      transitions: {
        Dec: Transition.make({
          state: Counter,
          input: Schema.Struct({}),
          when: ({ state }) => isPositive(state.count),
          apply: ({ state }) => [Transition.add(state.count, -1)],
        }),
      },
    })
    const CounterMsg = defineMessageUnion({ Dec: {} })
    const CounterAgent = Agent.forModel<{ readonly count: number }>()
    const Tools = machineTools({
      agent: CounterAgent,
      machine: ForeignMachine,
      foreign: { 'agent.isPositive@1': { run: ([n]) => (n as number) > 0 } },
    })
    const definition = CounterAgent.make({
      messages: CounterAgent.expose(CounterMsg, {
        Dec: Tools.Dec('Decrement counter'),
      }),
    })
    let model = { count: 0 }
    const runtime = CounterAgent.bind({
      definition,
      host: {
        model: () => model,
        principal: () => undefined,
        dispatch: () => {},
      },
    })
    expect(Effect.runSync(runtime.messages.available)).toEqual([])
    model = { count: 3 }
    expect(Effect.runSync(runtime.messages.available).map(c => c.name)).toEqual(['dec'])
  })

  it('lists language.describe() in x-metakit-operations on tool input schemas (Bout 9.2)', () => {
    const isPositive = Operation.define({
      id: 'agent.isPositive',
      version: 1,
      args: [Schema.Int] as const,
      returns: Schema.Boolean,
      nulls: 'strict',
    })
    const Lang = Language.make({
      check: { isPositive },
    })
    const CounterMsg = defineMessageUnion({ Dec: {} })
    const CounterAgent = Agent.forModel<{ readonly count: number }>()
    const Tools = machineTools({
      agent: CounterAgent,
      machine: CounterMachine,
      language: Lang,
    })
    const definition = CounterAgent.make({
      messages: CounterAgent.expose(CounterMsg, {
        Dec: Tools.Dec('Decrement counter'),
      }),
    })
    const runtime = CounterAgent.bind({
      definition,
      host: {
        model: () => ({ count: 2 }),
        principal: () => undefined,
        dispatch: () => {},
      },
    })
    const [tool] = Effect.runSync(runtime.messages.available)
    const ops = (tool!.inputSchema as Readonly<Record<string, unknown>>)['x-metakit-operations']
    expect(ops).toEqual(Lang.describe())
  })
})

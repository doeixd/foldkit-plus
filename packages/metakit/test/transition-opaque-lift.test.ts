import { Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Path, Transition } from '@doeixd/metakit'

const Inner = Schema.Struct({ a: Schema.Int, b: Schema.Int })
const Middle = Schema.Struct({ child: Inner })
const Outer = Schema.Struct({ board: Middle })

type Inner = typeof Inner.Type
type Middle = typeof Middle.Type
type Outer = typeof Outer.Type

let runs = 0
const Step = Transition.opaque({
  name: 'Increment',
  state: Inner,
  input: Schema.Struct({}),
  reads: () => [],
  writes: ({ state }) => [state.a, state.b],
  run: state => {
    runs += 1
    return { a: state.a + 1, b: state.b + 1 }
  },
})

const Lifted = Transition.lift(Path.make<Middle, Inner>(['child']), Step)
const Nested = Transition.lift(Path.make<Outer, Middle>(['board']), Lifted)

const start = { a: 1, b: 2 }
const middle = { child: start }
const outer = { board: middle }

describe('a lifted opaque body runs once per step', () => {
  it('computes once for two written fields, directly, lifted and nested', () => {
    runs = 0
    const direct = Result.getOrThrow(Transition.step(Step, start, {}))
    expect(runs).toBe(1)
    expect(direct.state).toEqual({ a: 2, b: 3 })

    runs = 0
    const lifted = Result.getOrThrow(Transition.step(Lifted, middle, {}))
    expect(runs).toBe(1)
    expect(lifted.state).toEqual({ child: { a: 2, b: 3 } })

    runs = 0
    const nested = Result.getOrThrow(Transition.step(Nested, outer, {}))
    expect(runs).toBe(1)
    expect(nested.state).toEqual({ board: { child: { a: 2, b: 3 } } })
  })

  it('computes again on a second step', () => {
    runs = 0
    Result.getOrThrow(Transition.step(Lifted, middle, {}))
    Result.getOrThrow(Transition.step(Lifted, middle, {}))
    expect(runs).toBe(2)
  })

  it('refuses a missing child without running the body', () => {
    runs = 0
    // A state the Schema refuses: the guard is what keeps the body from running.
    const missing = { child: null } as unknown as Middle
    expect(Result.isFailure(Transition.step(Lifted, missing, {}))).toBe(true)
    expect(runs).toBe(0)
  })
})

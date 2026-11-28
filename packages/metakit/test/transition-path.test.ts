/**
 * Where a transition refuses instead of guessing, and the edges of `Path`
 * and `Expr.match`.
 */
import { Option, Result, Schema } from 'effect'
import { Expr, Num, Ord, Path, Transition } from 'metakit'
import { describe, expect, it } from 'vitest'

const Child = Schema.Struct({ count: Schema.Int })
type Child = typeof Child.Type

describe('Transition', () => {
  it.each([
    ['the struct first', true],
    ['the field first', false],
  ])('refuses a write under the target of another (%s)', (_, structFirst) => {
    const State = Schema.Struct({ a: Schema.Struct({ b: Schema.Int, c: Schema.Int }) })
    const Input = Schema.Struct({ next: Schema.Struct({ b: Schema.Int, c: Schema.Int }) })
    expect(() =>
      Transition.make({
        state: State,
        input: Input,
        apply: ({ state, input }) => {
          const struct = Transition.set(state.a, input.next)
          const field = Transition.set(state.a.b, 99)
          return structFirst ? [struct, field] : [field, struct]
        },
      }),
    ).toThrow('overlapping write targets "a" and "a.b"')
  })

  it('still takes writes to two fields of one struct', () => {
    const State = Schema.Struct({ a: Schema.Struct({ b: Schema.Int, c: Schema.Int }) })
    const Both = Transition.make({
      state: State,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.set(state.a.b, 1), Transition.set(state.a.c, 2)],
    })
    expect(Transition.run(Both, { a: { b: 0, c: 0 } }, {})).toEqual(
      Result.succeed({ a: { b: 1, c: 2 } }),
    )
  })

  it('refuses an input that is not a value of its Schema', () => {
    const Add = Transition.make({
      state: Schema.Struct({ n: Schema.Int }),
      input: Schema.Struct({ amount: Schema.Int.check(Schema.isGreaterThan(0)) }),
      apply: ({ state, input }) => [Transition.set(state.n, Num.add(state.n, input.amount))],
    })
    expect(Transition.run(Add, { n: 1 }, { amount: 7 })).toEqual(Result.succeed({ n: 8 }))
    for (const input of ['{"amount":"7"}', '{}', '{"amount":-5}', '{"amount":1.5}', 'null']) {
      const refused = Transition.run(Add, { n: 1 }, JSON.parse(input))
      expect(Result.isFailure(refused) && refused.failure.reason, input).toContain('input')
    }
  })

  describe('lifted along a path', () => {
    interface Outer {
      readonly child: Child | null
      readonly other: number
    }
    const child = Path.make<Outer, Child>(['child'], Option.some(Child.ast))
    const Bump = Transition.make({
      state: Child,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.set(state.count, Num.add(state.count, 1))],
    })

    it('refuses where the model holds no child, and invents none', () => {
      const lifted = Transition.lift(child, Bump)
      expect(Transition.run(lifted, { child: { count: 1 }, other: 0 }, {})).toEqual(
        Result.succeed({ child: { count: 2 }, other: 0 }),
      )
      expect(Result.isFailure(Transition.run(lifted, { child: null, other: 0 }, {}))).toBe(true)
      expect(Result.isFailure(Transition.run(lifted, JSON.parse('{"other":0}'), {}))).toBe(true)
    })

    it('does not run an opaque guard over a child that is not there', () => {
      const Guarded = Transition.make({
        state: Child,
        input: Schema.Struct({}),
        when: ({ state }) =>
          Expr.opaque({ name: 'positive', reads: [state.count] }, env => env.state.count > 0),
        apply: ({ state }) => [Transition.set(state.count, 0)],
      })
      const lifted = Transition.lift(child, Guarded)
      expect(Result.isFailure(Transition.run(lifted, { child: null, other: 0 }, {}))).toBe(true)
      expect(Result.isSuccess(Transition.run(lifted, { child: { count: 3 }, other: 0 }, {}))).toBe(
        true,
      )
    })

    it('gives the reads of the state from the state, as its writes are', () => {
      const footprint = Transition.footprint(Transition.lift(child, Bump))
      expect(footprint.writes).toEqual([['child', 'count']])
      expect(footprint.stateReads).toEqual(Option.some([['child'], ['child', 'count']]))
      expect(footprint.reads).toEqual(
        Option.some([
          ['state', 'child'],
          ['state', 'child', 'count'],
        ]),
      )
    })
  })
})

describe('Path', () => {
  it('writes into an array and leaves it an array', () => {
    const model = { items: [{ x: 1 }, { x: 2 }] }
    const second = Path.make<typeof model, number>(['items', '1', 'x'])
    const next = Path.set(second, model, 9)
    expect(next).toEqual({ items: [{ x: 1 }, { x: 9 }] })
    expect(Array.isArray(next.items)).toBe(true)
    expect(next.items[0]).toBe(model.items[0])
    expect(model.items[1]).toEqual({ x: 2 })
  })

  it('reaches a field named as a member of Path by composing', () => {
    const Shadow = Schema.Struct({ segments: Schema.Int, node: Schema.Int })
    const $ = Path.from(Shadow)
    expect($.segments).toEqual([])
    const field = Path.compose($, Path.field<typeof Shadow.Type, 'segments'>('segments'))
    expect(Expr.eval(Ord.gte(field, 1), { segments: 5, node: 0 })).toBe(true)
  })
})

describe('Expr.match', () => {
  const Row = Schema.Struct({ status: Schema.Literals(['open', 'frozen']) })
  const status = Path.from(Row).status

  it('refuses a key that is not a value of the enumeration', () => {
    // Typed wider than its Schema, as a path built by hand can be.
    const wide: Expr.Expr<typeof Row.Type, 'open' | 'frozen' | 'gone'> = status
    expect(() => Expr.match(wide, { open: 1, frozen: 2, gone: 3 })).toThrow(
      '"gone" is not a value of status',
    )
    expect(() => Expr.matchOrElse(wide, { gone: 3 }, 0)).toThrow('"gone" is not a value of status')
  })

  it('refuses to leave a value of the enumeration without a case', () => {
    const narrow = Path.accessor<typeof Row.Type, 'open'>(['status'], status.ast)
    expect(() => Expr.match(narrow, { open: 1 })).toThrow('no case for "frozen" of status')
    expect(Expr.eval(Expr.matchOrElse(narrow, { open: 1 }, 0), { status: 'frozen' })).toBe(0)
  })
})

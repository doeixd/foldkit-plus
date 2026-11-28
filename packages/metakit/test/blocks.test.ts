/**
 * `Machine.lift` and `Machine.compose`: a parent Machine made of child
 * Machines lifted along paths. Each claim is checked against the child run
 * alone on the child's state.
 */
import { Effect, Option, Result, Schema } from 'effect'
import { Expr, Num, Path, Transition, Verdict } from '@doeixd/metakit'
import * as Graph from '@doeixd/metakit/graph'
import * as Machine from '@doeixd/metakit/machine'
import * as Prove from '@doeixd/metakit/prove'
import { describe, expect, expectTypeOf, it } from 'vitest'

const Counter = Schema.Struct({ count: Schema.Int, label: Schema.String })
type Counter = typeof Counter.Type

const Counters = Machine.make({
  state: Counter,
  transitions: {
    Added: Transition.make({
      state: Counter,
      input: Schema.Struct({ amount: Schema.Int }),
      when: ({ state, input }) => Num.lte(Num.add(state.count, input.amount), 10),
      apply: ({ state, input }) => [
        Transition.set(state.count, Num.add(state.count, input.amount)),
      ],
      emits: ({ state, input }) => [
        Transition.emit('Counted', { was: state.count, added: input.amount }),
      ],
    }),
    Reset: Transition.make({
      state: Counter,
      input: Schema.Struct({}),
      when: ({ state }) => Num.gt(state.count, 0),
      apply: ({ state }) => [Transition.set(state.count, 0)],
    }),
    Labelled: Transition.make({
      state: Counter,
      input: Schema.Struct({ label: Schema.String }),
      apply: ({ state, input }) => [Transition.set(state.label, input.label)],
    }),
  },
})

const Board = Schema.Struct({
  title: Schema.String,
  left: Counter,
  right: Counter,
  spare: Schema.NullOr(Counter),
  extra: Schema.optional(Counter),
})
type Board = typeof Board.Type
const board = Path.from(Board)

const Boards = Machine.compose({
  state: Board,
  transitions: {
    Renamed: Transition.make({
      state: Board,
      input: Schema.Struct({ title: Schema.String }),
      apply: ({ state, input }) => [Transition.set(state.title, input.title)],
    }),
  },
  children: {
    Left: Machine.lift(board.left, Counters),
    Right: Machine.lift(board.right, Counters),
    Spare: Machine.lift(board.spare, Counters),
    Extra: Machine.lift(board.extra, Counters),
  },
})

const counter = (count: number): Counter => ({ count, label: 'c' })
const start: Board = { title: 't', left: counter(0), right: counter(4), spare: null }

it('names each child transition by the child, then its own tag', () => {
  expect(Object.keys(Boards.transitions)).toEqual([
    'Renamed',
    ...['Left', 'Right', 'Spare', 'Extra'].flatMap(name => [
      `${name}Added`,
      `${name}Reset`,
      `${name}Labelled`,
    ]),
  ])
  expectTypeOf<Machine.MessageOf<typeof Boards.transitions>['_tag']>().toEqualTypeOf<
    'Renamed' | `${'Left' | 'Right' | 'Spare' | 'Extra'}${'Added' | 'Reset' | 'Labelled'}`
  >()
  expectTypeOf<
    Extract<Machine.MessageOf<typeof Boards.transitions>, { readonly _tag: 'RightAdded' }>['input']
  >().toEqualTypeOf<{ readonly amount: number }>()
})

describe('a child Message on the composed Machine does what it does on the child', () => {
  const counts = [0, 4, 9, 10]

  it.each(counts.flatMap(count => [1, 6].map(amount => [count, amount] as const)))(
    'Added from %i by %i',
    (count, amount) => {
      const model: Board = { ...start, left: counter(count) }
      const alone = Counters.dispatch(model.left, { _tag: 'Added', input: { amount } })
      const composed = Boards.dispatch(model, { _tag: 'LeftAdded', input: { amount } })
      expect(Result.isSuccess(composed)).toBe(Result.isSuccess(alone))
      if (Result.isSuccess(alone) && Result.isSuccess(composed)) {
        expect(composed.success.state).toEqual({ ...model, left: alone.success.state })
        expect(composed.success.emitted).toEqual(alone.success.emitted)
        expect(composed.success.emitted).toEqual([{ _tag: 'Counted', was: count, added: amount }])
        expect(composed.success.state.right).toBe(model.right)
      }
    },
  )

  it.each(counts)('canDispatch and affordances from %i', count => {
    const model: Board = { ...start, left: counter(count), right: counter(10 - count) }
    for (const [name, child] of [
      ['Left', model.left],
      ['Right', model.right],
    ] as const) {
      expect(Machine.canDispatch(Boards, `${name}Reset`, { state: model })._tag).toBe(
        Machine.canDispatch(Counters, 'Reset', { state: child })._tag,
      )
      expect(
        Machine.canDispatch(Boards, `${name}Added`, { state: model, input: { amount: 3 } })._tag,
      ).toBe(Machine.canDispatch(Counters, 'Added', { state: child, input: { amount: 3 } })._tag)
      const alone = Machine.affordances(Counters, child)
      const composed = Machine.affordances(Boards, model)
      for (const kind of ['available', 'disabled', 'pending'] as const) {
        expect(composed[kind].filter(tag => tag.startsWith(name))).toEqual(
          alone[kind].map(tag => `${name}${tag}`),
        )
      }
    }
  })

  it('a no-op gives back the Model it was given', () => {
    const model: Board = { ...start, left: counter(3) }
    const same = Boards.dispatch(model, { _tag: 'LeftLabelled', input: { label: 'c' } })
    expect(Result.isSuccess(same) && same.success.state).toBe(model)
  })
})

it('one child Machine at two paths writes each place alone', () => {
  const [left] = Boards.update(start, { _tag: 'LeftAdded', input: { amount: 2 } })
  const [both] = Boards.update(left, { _tag: 'RightAdded', input: { amount: 5 } })
  expect(both).toEqual({ ...start, left: counter(2), right: counter(9) })
  expect(left.right).toBe(start.right)
  expect(both.left).toBe(left.left)
})

describe('a child at a path that may hold none', () => {
  it('is refused where there is none, and no child is invented', () => {
    for (const tag of ['SpareLabelled', 'ExtraLabelled'] as const) {
      const refused = Boards.dispatch(start, { _tag: tag, input: { label: 'new' } })
      expect(Result.isFailure(refused)).toBe(true)
      expect(Boards.update(start, { _tag: tag, input: { label: 'new' } })[0]).toBe(start)
    }
  })

  it('a null child disables its Messages; a missing key is a state not yet known', () => {
    const { disabled, pending } = Machine.affordances(Boards, start)
    // `LeftReset` is the child's own refusal: its count is 0.
    expect(disabled).toEqual(['LeftReset', 'SpareAdded', 'SpareReset', 'SpareLabelled'])
    expect(pending).toEqual([
      'LeftAdded',
      'RightAdded',
      'ExtraAdded',
      'ExtraReset',
      'ExtraLabelled',
    ])
    expect(Verdict.isFalse(Machine.canDispatch(Boards, 'SpareLabelled', { state: start }))).toBe(
      true,
    )
  })

  it('runs where there is one', () => {
    const model: Board = { ...start, spare: counter(1), extra: counter(2) }
    expect(Boards.update(model, { _tag: 'SpareAdded', input: { amount: 1 } })[0].spare).toEqual(
      counter(2),
    )
    expect(Boards.update(model, { _tag: 'ExtraReset', input: {} })[0].extra).toEqual(counter(0))
  })
})

describe('footprints', () => {
  it('are the child footprints under the path, with the read of the child itself', () => {
    expect(Boards.footprints.LeftAdded).toMatchObject({
      writes: [['left', 'count']],
      reads: Option.some([
        ['state', 'left'],
        ['state', 'left', 'count'],
        ['input', 'amount'],
      ]),
    })
    expect(Boards.footprints.RightLabelled.writes).toEqual([['right', 'label']])
    expect(Boards.footprints.Renamed.writes).toEqual([['title']])
  })

  it('a write under a child path reaches a read of the path, above it and below it, and no sibling', () => {
    const { affectedBy } = Graph.analyze(Boards, {
      whole: Path.root<Board>(),
      left: board.left,
      leftCount: board.left.count,
      leftLabel: board.left.label,
      right: board.right,
      rightCount: board.right.count,
      title: board.title,
    })
    expect(affectedBy.LeftAdded).toEqual(['whole', 'left', 'leftCount'])
    expect(affectedBy.LeftLabelled).toEqual(['whole', 'left', 'leftLabel'])
    expect(affectedBy.RightAdded).toEqual(['whole', 'right', 'rightCount'])
    expect(affectedBy.Renamed).toEqual(['whole', 'title'])
  })
})

describe('nesting', () => {
  const Pair = Schema.Struct({ left: Counter, right: Counter })
  const Pairs = Machine.compose({
    state: Pair,
    transitions: {},
    children: {
      Left: Machine.lift(Path.from(Pair).left, Counters),
      Right: Machine.lift(Path.from(Pair).right, Counters),
    },
  })
  const Table = Schema.Struct({ front: Pair, back: Schema.NullOr(Pair) })
  const Tables = Machine.compose({
    state: Table,
    transitions: {},
    children: {
      Front: Machine.lift(Path.from(Table).front, Pairs),
      Back: Machine.lift(Path.from(Table).back, Pairs),
    },
  })
  const pair = { left: counter(1), right: counter(2) }

  it('a composed Machine is lifted as any other', () => {
    expect(Tables.footprints.FrontRightAdded.writes).toEqual([['front', 'right', 'count']])
    const table = { front: pair, back: pair }
    const [next] = Tables.update(table, { _tag: 'BackLeftReset', input: {} })
    expect(next).toEqual({ front: pair, back: { left: counter(0), right: counter(2) } })
    expect(next.front).toBe(pair)
  })

  it('is refused where an outer child is missing', () => {
    const table = { front: pair, back: null }
    expect(Result.isFailure(Tables.dispatch(table, { _tag: 'BackLeftReset', input: {} }))).toBe(
      true,
    )
  })
})

describe('names', () => {
  const Renamed = Transition.make({
    state: Board,
    input: Schema.Struct({}),
    apply: ({ state }) => [Transition.set(state.title, '')],
  })
  const lifted = Machine.lift(board.left, Counters)

  it("the key '' keeps a child's tags, and a Machine over the same state is a child", () => {
    const Flat = Machine.compose({
      state: Board,
      transitions: {},
      children: { '': lifted, Board: Machine.make({ state: Board, transitions: { Renamed } }) },
    })
    expect(Object.keys(Flat.transitions)).toEqual(['Added', 'Reset', 'Labelled', 'BoardRenamed'])
    expect(Flat.update(start, { _tag: 'Added', input: { amount: 1 } })[0].left.count).toBe(1)
  })

  it('refuses a child tag that is one of its own', () => {
    expect(() =>
      // @ts-expect-error `LeftReset` is the child's `Reset` under `Left`
      Machine.compose({
        state: Board,
        transitions: { LeftReset: Renamed },
        children: { Left: lifted },
      }),
    ).toThrow('the transitions and the child "Left" both name a transition "LeftReset"')
  })

  it('refuses two children whose names and tags read the same', () => {
    const Tagged = Machine.make({ state: Board, transitions: { tReset: Renamed } })
    expect(() =>
      // @ts-expect-error `Lef` with `tReset` is `Left` with `Reset`
      Machine.compose({
        state: Board,
        transitions: {},
        children: { Left: lifted, Lef: Tagged },
      }),
    ).toThrow('the child "Left" and the child "Lef" both name a transition "LeftReset"')
  })

  it('does not lift along a path to something other than the child state', () => {
    // @ts-expect-error `title` is a string, not a Counter
    Machine.lift(board.title, Counters)
  })

  it('reads a transition named as a member of every object as its own', () => {
    const Odd = Machine.compose({
      state: Board,
      transitions: {},
      children: { ['__proto__']: lifted, constructor: lifted },
    })
    expect(Object.keys(Odd.transitions)).toContain('__proto__Added')
    expect(Object.keys(Odd.transitions)).toContain('constructorReset')
  })

  it('an opaque guard of a child is not run over a child that is not there', () => {
    const Guarded = Machine.make({
      state: Counter,
      transitions: {
        Cleared: Transition.make({
          state: Counter,
          input: Schema.Struct({}),
          when: ({ state }) =>
            Expr.opaque({ name: 'positive', reads: [state.count] }, env => env.state.count > 0),
          apply: ({ state }) => [Transition.set(state.count, 0)],
        }),
      },
    })
    const Opaque = Machine.compose({
      state: Board,
      transitions: {},
      children: { Spare: Machine.lift(board.spare, Guarded) },
    })
    expect(Opaque.update(start, { _tag: 'SpareCleared', input: {} })[0]).toBe(start)
    expect(
      Opaque.update({ ...start, spare: counter(3) }, { _tag: 'SpareCleared', input: {} })[0].spare,
    ).toEqual(counter(0))
  })
})

describe('a composed Machine is proved against the parent Schema', () => {
  const Capped = Schema.Struct({
    count: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10 })),
  })
  const Holder = Schema.Struct({ left: Capped, spare: Schema.NullOr(Capped) })
  /** Adds one while the count is under `limit`: the field takes at most 10. */
  const composed = (limit: number) => {
    const child = Machine.make({
      state: Capped,
      transitions: {
        Added: Transition.make({
          state: Capped,
          input: Schema.Struct({}),
          when: ({ state }) => Num.lt(state.count, limit),
          apply: ({ state }) => [Transition.set(state.count, Num.add(state.count, 1))],
        }),
      },
    })
    return Machine.compose({
      state: Holder,
      transitions: {},
      children: {
        Left: Machine.lift(Path.from(Holder).left, child),
        Spare: Machine.lift(Path.from(Holder).spare, child),
      },
    })
  }

  it("proves a child's transitions where they keep the child's bounds", async () => {
    const report = await Effect.runPromise(Prove.machine(composed(10)))
    expect(report.ok).toBe(true)
    expect(report.entries.map(entry => entry.status)).toEqual(['proved', 'proved'])
  })

  it('refutes them, at the path of the child, where they do not', async () => {
    const report = await Effect.runPromise(Prove.machine(composed(11)))
    expect(report.ok).toBe(false)
    expect(report.format()).toContain(
      'repro:    Transition.run(LeftAdded, {"left":{"count":10},"spare":null}, {})',
    )
    expect(report.format()).toContain('REFUTED SpareAdded')
  })
})

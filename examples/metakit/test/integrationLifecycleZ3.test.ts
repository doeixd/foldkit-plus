/**
 * Bug-Hunting Sweep 5B: Nullable/optional lifted child machines, `Transition.opaque`,
 * `patchWhere`/`removeWhere`/`move` no-op identity, and Z3 proofs over `Match`, `If`,
 * `OrderedEnum`, `Time`, and `Money.mul`.
 */
import { Effect, Result, Schema } from 'effect'
import { Bool, Eq, Expr, Null, Num, Path, Time, Transition, Verdict } from '@doeixd/metakit'
import { CalendarDay, Money, OrderedEnum } from '@doeixd/metakit/domain'
import * as Graph from '@doeixd/metakit/graph'
import * as Machine from '@doeixd/metakit/machine'
import * as Prove from '@doeixd/metakit/prove'
import { describe, expect, it } from 'vitest'

describe('Bug-Hunting Sweep 5B: Lifted nullable children, list writes, opaque & Z3 proofs', () => {
  it('handles Machine.lift into a NullOr child field: refuses when null, runs when present', () => {
    const Child = Schema.Struct({ count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) })
    const Parent = Schema.Struct({
      name: Schema.String,
      child: Schema.NullOr(Child),
    })
    const IncChild = Transition.make({
      state: Child,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.add(state.count, 1)],
    })
    const ChildMachine = Machine.make({ state: Child, transitions: { Inc: IncChild } })
    const $p = Path.from(Parent)
    const ParentMachine = Machine.compose({
      state: Parent,
      transitions: {
        AttachChild: Transition.make({
          state: Parent,
          input: Schema.Struct({}),
          when: ({ state }) => Null.isNull(state.child),
          apply: ({ state }) => [Transition.set(state.child, Expr.lit({ count: 0 }))],
        }),
      },
      children: { Child: Machine.lift($p.child, ChildMachine) },
    })

    const withoutChild = { name: 'p', child: null }
    // Dispatching ChildInc when child is null MUST be refused
    expect(
      Result.isFailure(ParentMachine.dispatch(withoutChild, { _tag: 'ChildInc', input: {} })),
    ).toBe(true)
    // Machine.affordances should NOT list ChildInc as available when child is null
    const affNull = Machine.affordances(ParentMachine, withoutChild)
    expect(affNull.available).not.toContain('ChildInc')
    expect(affNull.disabled).toContain('ChildInc')

    // After attaching child, ChildInc becomes available and increments count
    const [withChild] = ParentMachine.update(withoutChild, { _tag: 'AttachChild', input: {} })
    expect(withChild.child).toEqual({ count: 0 })
    const [incremented] = ParentMachine.update(withChild, { _tag: 'ChildInc', input: {} })
    expect(incremented.child).toEqual({ count: 1 })

    const analysis = Graph.analyze(ParentMachine, {
      title: $p.name,
      childCount: $p.child.count,
    })
    expect(analysis.affectedBy.ChildInc).toEqual(['childCount'])
  })

  it('enforces Transition.opaque footprint bounds and preserves no-op identity on list writes', () => {
    const Row = Schema.Struct({
      id: Schema.Int,
      tag: Schema.String,
      score: Schema.Int,
    })
    const ListState = Schema.Struct({
      secret: Schema.Int,
      rows: Schema.Array(Row),
    })

    // Opaque transition that illegally mutates `secret` outside declared `writes: [rows]` MUST throw
    const SneakyOpaque = Transition.opaque({
      name: 'sneaky',
      state: ListState,
      input: Schema.Struct({}),
      reads: ({ state }) => [state.rows],
      writes: ({ state }) => [state.rows],
      run: state => ({ ...state, secret: state.secret + 1 }),
    })
    expect(() => Transition.run(SneakyOpaque, { secret: 0, rows: [] }, {})).toThrow()

    // patchWhere, removeWhere, and move preserve reference identity on no-op and emit 0 observed writes
    const BumpMatching = Transition.make({
      state: ListState,
      input: Schema.Struct({ tag: Schema.String }),
      apply: ({ state, input }) => [
        Transition.patchWhere(
          state.rows,
          r => Eq.is(r.tag, input.tag),
          r => ({ score: Num.add(r.score, 1) }),
        ),
      ],
    })
    const RemoveMatching = Transition.make({
      state: ListState,
      input: Schema.Struct({ tag: Schema.String }),
      apply: ({ state, input }) => [
        Transition.removeWhere(state.rows, r => Eq.is(r.tag, input.tag)),
      ],
    })
    const MoveRow = Transition.make({
      state: ListState,
      input: Schema.Struct({ id: Schema.Int, toIndex: Schema.Int }),
      apply: ({ state, input }) => [Transition.move(state.rows, input.id, input.toIndex)],
    })

    const initial = {
      secret: 42,
      rows: [
        { id: 1, tag: 'a', score: 10 },
        { id: 2, tag: 'b', score: 20 },
      ],
    }
    const noopPatch = Result.getOrThrow(
      Transition.stepObserved(BumpMatching, initial, { tag: 'missing' }),
    )
    expect(noopPatch.state).toBe(initial)
    expect(noopPatch.writes).toEqual([])

    const noopRemove = Result.getOrThrow(
      Transition.stepObserved(RemoveMatching, initial, { tag: 'missing' }),
    )
    expect(noopRemove.state).toBe(initial)
    expect(noopRemove.writes).toEqual([])

    const noopMove = Result.getOrThrow(
      Transition.stepObserved(MoveRow, initial, { id: 1, toIndex: 0 }),
    )
    expect(noopMove.state).toBe(initial)
    expect(noopMove.writes).toEqual([])

    const moved = Result.getOrThrow(
      Transition.stepObserved(MoveRow, initial, { id: 2, toIndex: 0 }),
    )
    expect(moved.state.rows.map(r => r.id)).toEqual([2, 1])
    expect(moved.writes.length).toBeGreaterThan(0)
  })

  it('proves invariants over Match, If, OrderedEnum, Time.overlaps, and Money.mul in Z3', async () => {
    const Level = OrderedEnum.make(['low', 'mid', 'high'] as const)
    const Usd = Money.make('USD')
    const Ticket = Schema.Struct({
      level: Level.schema,
      start: CalendarDay.schema,
      end: CalendarDay.schema,
      amount: Usd.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 })),
    }).pipe(Expr.refine($ => Num.gt($.end, $.start)))
    const $ = Path.from(Ticket)

    // 1. OrderedEnum + Match: high => rank >= 2, low/mid => rank <= 1
    const matchGoal = Expr.match($.level, {
      low: Level.lt($.level, 'high'),
      mid: Level.lt($.level, 'high'),
      high: Level.gte($.level, 'high'),
    })
    expect(Verdict.isTrue(await Effect.runPromise(Prove.invariant(Ticket, matchGoal)))).toBe(true)

    // 2. Time.overlaps: any valid non-empty interval [start, end) overlaps itself!
    const selfOverlap = Time.overlaps($.start, $.end, $.start, $.end)
    expect(Verdict.isTrue(await Effect.runPromise(Prove.invariant(Ticket, selfOverlap)))).toBe(true)

    // 3. Time.overlaps: [start, end) NEVER overlaps [end, end + 5) (half-open, guarded with Expr.when away from 9999-12-31)
    const adjacentNoOverlap = Expr.when(
      Num.lte($.end, Result.getOrThrow(CalendarDay.fromIso('9999-12-20'))),
      {
        then: Bool.not(Time.overlaps($.start, $.end, $.end, Time.addDays($.end, 5))),
        else: true,
      },
    )
    expect(
      Verdict.isTrue(await Effect.runPromise(Prove.invariant(Ticket, adjacentNoOverlap))),
    ).toBe(true)

    // 4. Money.mul: 10% of a non-negative amount <= 1_000_000 is non-negative and <= amount
    const tax = Num.mulScaled($.amount, 10, { shift: 2 })
    const taxBounded = Expr.all(Num.gte(tax, 0), Num.lte(tax, $.amount))
    expect(Verdict.isTrue(await Effect.runPromise(Prove.invariant(Ticket, taxBounded)))).toBe(true)
  })
})

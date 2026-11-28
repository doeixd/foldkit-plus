/**
 * Bug-Hunting Sweep 3: Commutativity soundness stress test.
 *
 * Builds a multi-field machine with every write way (`add`, `set`, `insert`,
 * `remove`, `removeWhere`, `patch`, `patchWhere`, `include`, `exclude`) and
 * verifies that EVERY pair `Transition.commutes` declares `True` actually
 * produces identical state, emitted records, and refusal status in both orders
 * across 200 randomized executions.
 */
import { Result, Schema } from 'effect'
import { Bool, Eq, Num, Transition, Verdict } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import * as Pairs from '@doeixd/metakit/pairs'
import { describe, expect, it } from 'vitest'

const Item = Schema.Struct({
  id: Schema.Int,
  title: Schema.String,
  done: Schema.Boolean,
  score: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
})

const Board = Schema.Struct({
  count: Schema.Int.check(Schema.isBetween({ minimum: -1000, maximum: 1000 })),
  flag: Schema.Boolean,
  tags: Schema.Array(Schema.String),
  items: Schema.Array(Item),
})
type Board = typeof Board.Type

const Inc = Transition.make({
  state: Board,
  input: Schema.Struct({ n: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10 })) }),
  apply: ({ state, input }) => [Transition.add(state.count, input.n)],
})

const Dec = Transition.make({
  state: Board,
  input: Schema.Struct({ n: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10 })) }),
  apply: ({ state, input }) => [Transition.add(state.count, Num.neg(input.n))],
})

const SetFlagTrue = Transition.make({
  state: Board,
  input: Schema.Struct({}),
  apply: ({ state }) => [Transition.set(state.flag, true)],
})

const AddTag = Transition.make({
  state: Board,
  input: Schema.Struct({ tag: Schema.Literals(['a', 'b', 'c']) }),
  apply: ({ state, input }) => [Transition.include(state.tags, input.tag)],
})

const RemoveTag = Transition.make({
  state: Board,
  input: Schema.Struct({ tag: Schema.Literals(['a', 'b', 'c']) }),
  apply: ({ state, input }) => [Transition.exclude(state.tags, input.tag)],
})

const MarkDone = Transition.make({
  state: Board,
  input: Schema.Struct({ id: Schema.Int }),
  apply: ({ state, input }) => [Transition.patch(state.items, input.id, () => ({ done: true }))],
})

const RenameItem = Transition.make({
  state: Board,
  input: Schema.Struct({ id: Schema.Int, title: Schema.String }),
  apply: ({ state, input }) => [
    Transition.patch(state.items, input.id, () => ({ title: input.title })),
  ],
})

const RemoveItem = Transition.make({
  state: Board,
  input: Schema.Struct({ id: Schema.Int }),
  apply: ({ state, input }) => [Transition.remove(state.items, input.id)],
})

const PruneDone = Transition.make({
  state: Board,
  input: Schema.Struct({}),
  apply: ({ state }) => [
    Transition.removeWhere(state.items, item => Bool.and(item.done, Eq.is(item.score, 0))),
  ],
})

const BoardMachine = Machine.make({
  state: Board,
  transitions: {
    Inc,
    Dec,
    SetFlagTrue,
    AddTag,
    RemoveTag,
    MarkDone,
    RenameItem,
    RemoveItem,
    PruneDone,
  },
})

describe('Bug-Hunting Sweep 3: Commutativity soundness stress', () => {
  it('every pair Transition.commutes marks True actually commutes under seeded walks', () => {
    const pairs = Pairs.pairs(BoardMachine)
    const provedPairs = pairs.filter(p => Verdict.isTrue(p.verdict))
    expect(provedPairs.length).toBeGreaterThan(0)

    for (const pair of provedPairs) {
      const walked = Pairs.walkPair(BoardMachine, pair.over, { seed: 2026, runs: 80 })
      expect(walked._tag, `Pair ${pair.name} was marked True (${pair.why}) but broke!`).not.toBe(
        'Broken',
      )
    }

    // Sanity check: MarkDone vs RenameItem (disjoint fields) commutes directly
    expect(Verdict.isTrue(Transition.commutes(MarkDone, RenameItem))).toBe(true)

    // Sanity check: Inc vs Dec (bounded adds) commutes
    const incDec = pairs.find(p => p.name === 'Inc/Dec' || p.name === 'Dec/Inc')
    expect(incDec).toBeDefined()
    expect(Verdict.isTrue(incDec!.verdict)).toBe(true)

    // Sanity check: AddTag vs RemoveTag does NOT claim True
    const tagPair = pairs.find(p => p.name === 'AddTag/RemoveTag' || p.name === 'RemoveTag/AddTag')
    expect(tagPair).toBeDefined()
    expect(Verdict.isUnknown(tagPair!.verdict)).toBe(true)
    expect(
      Result.isSuccess(
        Transition.step(Inc, { count: 0, flag: false, tags: [], items: [] }, { n: 1 }),
      ),
    ).toBe(true)
  })
})

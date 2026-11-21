import { Effect, Option, Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Num, Transition } from 'metakit'
import * as Rows from 'metakit/aggregates'
import * as Machine from 'metakit/machine'
import * as Prove from 'metakit/prove'
import type * as Store from 'metakit/store'
import * as Temporal from 'metakit/temporal'

const Counter = Schema.Struct({ count: Schema.Int })
const Add = Transition.make({
  state: Counter,
  input: Schema.Struct({ by: Schema.Int }),
  apply: ({ state, input }) => [Transition.set(state.count, Num.add(state.count, input.by))],
})
const Reset = Transition.make({
  state: Counter,
  input: Schema.Struct({}),
  apply: ({ state }) => [Transition.set(state.count, 0)],
})
const Counters = Machine.make({ state: Counter, transitions: { Add, Reset } })
const Row = Schema.Struct({ size: Schema.Int })

// A requirement's rule is a key of what was declared.
const needed = Temporal.requirements({
  machine: Counters,
  aggregates: { total: Rows.sum(Row, $ => $.size) },
})
expectTypeOf(needed).toEqualTypeOf<ReadonlyArray<Store.Requirement<'Add' | 'Reset' | 'total'>>>()
expectTypeOf<Store.Requirement['needs']>().toEqualTypeOf<'row-atomic' | 'parent-serialized'>()

const unknownLevel: Store.StoreCapabilities = {
  name: 'kv',
  // @ts-expect-error a store's isolation is one of the three levels
  isolation: 'snapshot',
  parentRowLock: false,
}
void unknownLevel

// An obligation is named by the pair it is over.
const owed = Temporal.obligations(Counters)
type Tag = 'Add' | 'Reset'
expectTypeOf(owed).toEqualTypeOf<ReadonlyArray<Temporal.WalkObligation<`${Tag}/${Tag}`, Tag>>>()
expectTypeOf<Awaited<ReturnType<typeof report>>['obligations']>().toEqualTypeOf(owed)
const report = () => Effect.runPromise(Prove.machine(Counters))

const scenario: Temporal.Scenario<number, 'send' | 'answer', Tag> = {
  initial: () => 0,
  steps: [
    { name: 'send', of: 'Add', run: n => n + 1 },
    { name: 'answer', of: 'Reset', after: ['send'], run: n => n },
  ],
  holds: () => Option.none(),
}
expectTypeOf(Temporal.walk(scenario)).toEqualTypeOf<Temporal.WalkResult<'send' | 'answer'>>()

Temporal.walk({
  initial: () => 0,
  steps: [
    { name: 'send', run: (n: number) => n },
    // @ts-expect-error a step waits only on a step of the scenario
    { name: 'answer', after: ['sent'], run: (n: number) => n },
  ],
  holds: () => Option.none(),
})

const [first] = owed
if (first !== undefined) {
  const done = Temporal.discharge(first, scenario)
  expectTypeOf(done.obligation).toEqualTypeOf<`${Tag}/${Tag}`>()
  Temporal.undischarged(owed, [done])
  // @ts-expect-error a discharge names an obligation of the list
  Temporal.undischarged(owed, [{ ...done, obligation: 'Add/Missing' }])

  const elsewhere: Temporal.Scenario<number, 'send', 'Other'> = {
    initial: () => 0,
    steps: [{ name: 'send', of: 'Other', run: n => n }],
    holds: () => Option.none(),
  }
  // @ts-expect-error the scenario's steps are of other Messages than the obligation's
  Temporal.discharge(first, elsewhere)
}

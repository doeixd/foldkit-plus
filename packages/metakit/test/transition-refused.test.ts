import { Option, Result, Schema } from 'effect'
import { expect, it } from 'vitest'
import { Node, Num, Ord, Path, Transition } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import * as Sql from '@doeixd/metakit/sql'

const State = Schema.Struct({ left: Schema.Int, right: Schema.Int })
const empty = { left: 0, right: 0 }
const max = Number.MAX_SAFE_INTEGER
const full = { left: max, right: max }
const NoInput = Schema.Struct({})
const By = Schema.Struct({ by: Schema.Int })

const Update = Transition.make({
  state: State,
  input: By,
  supplied: { next: Schema.Int },
  apply: ({ state, input, supplied }) => [
    Transition.add(state.left, input.by),
    Transition.set(state.right, supplied.next),
  ],
})

const GuardState = Schema.Struct({ ready: Schema.NullOr(Schema.Boolean) })
const Guarded = Transition.make({
  state: GuardState,
  input: NoInput,
  when: ({ state }) => state.ready,
  apply: () => [],
})
const OptionalGuarded = Transition.make({
  state: Schema.Struct({ ready: Schema.optional(Schema.Boolean) }),
  input: NoInput,
  when: ({ state }) => state.ready,
  apply: () => [],
})
const IllTypedGuard = Transition.make({
  state: State,
  input: NoInput,
  // @ts-expect-error A JavaScript caller can supply a non-boolean guard at runtime.
  when: () => 1,
  apply: () => [],
})
const OverflowGuard = Transition.make({
  state: State,
  input: NoInput,
  when: ({ state }) => Ord.gt(Num.add(state.left, 1), 0),
  apply: () => [],
})
const OverflowWrites = Transition.make({
  state: State,
  input: By,
  apply: ({ state, input }) => [
    Transition.add(state.left, input.by),
    Transition.add(state.right, 2),
  ],
})
const OverflowEmit = Transition.make({
  state: State,
  input: NoInput,
  apply: () => [],
  emits: ({ state }) => [Transition.emit('Added', { total: Num.add(state.right, 2) })],
})

const Profile = Schema.Struct({ name: Schema.String })
const OptionState = Schema.Struct({ profile: Schema.Option(Profile) })
const RenameInOption = Transition.make({
  state: OptionState,
  input: NoInput,
  apply: ({ state }) => [Transition.set(state.profile.name, 'new')],
})
const Item = Schema.Struct({ id: Schema.String, profile: Schema.optionalKey(Profile) })
const Rename = Transition.make({
  state: Item,
  input: NoInput,
  apply: ({ state }) => [Transition.set(state.profile.name, 'new')],
})

const machine = Machine.make({ state: GuardState, transitions: { Guarded } })
const unknownMessage = () =>
  // @ts-expect-error Exercise the runtime check for a tag from outside the message union.
  machine.dispatch({ ready: true }, { _tag: 'Missing', input: {} })

const List = Schema.Struct({ items: Schema.Array(Item) })
const each = Machine.compose({
  state: List,
  transitions: {},
  children: {
    '': Machine.each(
      Path.from(List).items,
      'id',
      Machine.make({ state: Item, transitions: { Rename } }),
    ),
  },
})

const overflow = (by: number) =>
  new Node.Refusal({
    reason: 'unsafe-integer',
    at: 'num.add',
    detail: `the result of ${max}, ${by} is past ±(2^53−1)`,
  })
const missingParent = 'is under "profile", which holds no value: write the whole value'
const insideOption = 'is inside the Option at "profile": write the whole value'
const guardReason = 'transition guard evaluated to false'
const inputReason = 'the input is not a value of its Schema'
const unwritable = (detail: string) =>
  Transition.Why.Unwritable({ target: ['profile', 'name'], detail })

it.each<
  [
    name: string,
    run: () => Result.Result<unknown, Transition.Refused>,
    why: () => Transition.Why,
    reason: string,
  ]
>([
  [
    'invalid input',
    () => Transition.run(Update, empty, { by: 0.5 }, { next: 1 }),
    () => Transition.Why.Input(),
    inputReason,
  ],
  [
    'invalid supplied value',
    () => Transition.run(Update, empty, { by: 1 }, { next: 0.5 }),
    () => Transition.Why.Supplied(),
    'a supplied value is not a value of its Schema',
  ],
  [
    'unknown message',
    unknownMessage,
    () => Transition.Why.UnknownMessage({ tag: 'Missing' }),
    'unknown message "Missing"',
  ],
  [
    'false guard',
    () => Transition.run(Guarded, { ready: false }, {}),
    () => Transition.Why.Guard({ answer: false }),
    guardReason,
  ],
  [
    'null guard',
    () => Transition.run(Guarded, { ready: null }, {}),
    () => Transition.Why.Guard({ answer: null }),
    guardReason,
  ],
  [
    'undefined guard value',
    () => Transition.run(OptionalGuarded, { ready: undefined }, {}),
    () => Transition.Why.Guard({ answer: null }),
    guardReason,
  ],
  [
    'refusing guard',
    () => Transition.run(OverflowGuard, full, {}),
    () => Transition.Why.GuardRefused({ refusal: overflow(1) }),
    guardReason,
  ],
  [
    'ill-typed guard',
    () => Transition.run(IllTypedGuard, empty, {}),
    () =>
      Transition.Why.GuardRefused({
        refusal: new Node.Refusal({
          reason: 'ill-typed',
          at: 'transition guard',
          detail: 'expected a boolean, got number',
        }),
      }),
    guardReason,
  ],
  [
    'two refusing writes',
    () => Transition.run(OverflowWrites, full, { by: 1 }),
    () => Transition.Why.Evaluation({ refusal: overflow(1) }),
    `evaluation refused: num.add: the result of ${max}, 1 is past ±(2^53−1)`,
  ],
  [
    'refusing emit',
    () => Transition.step(OverflowEmit, full, {}),
    () => Transition.Why.Evaluation({ refusal: overflow(2) }),
    `evaluation refused: num.add: the result of ${max}, 2 is past ±(2^53−1)`,
  ],
  [
    'write inside an Option',
    () => Transition.run(RenameInOption, { profile: Option.none() }, {}),
    () => unwritable(insideOption),
    `"profile.name" ${insideOption}`,
  ],
  [
    'write under an absent parent',
    () => Transition.run(Rename, { id: 'x' }, {}),
    () => unwritable(missingParent),
    `"profile.name" ${missingParent}`,
  ],
  [
    'nested child refusal',
    () => each.dispatch({ items: [{ id: 'x' }] }, { _tag: 'Rename', input: { id: 'x' } }),
    () => unwritable(missingParent),
    `"profile.name" ${missingParent}`,
  ],
])('reports the typed reason for %s', (_name, run, why, reason) => {
  const outcome = run()
  expect(Result.isFailure(outcome)).toBe(true)
  const failure = Result.getOrThrow(Result.flip(outcome))
  expect(failure.why).toEqual(why())
  expect(failure.reason).toBe(reason)
  expect(failure.message).toBe(reason)
})

it('reports invalid SQL input as a transition input refusal', () => {
  const outcome = Sql.toUpdate('item', OverflowWrites, { by: 0.5 })
  expect(Result.isFailure(outcome)).toBe(true)
  const failure = Result.getOrThrow(Result.flip(outcome))
  expect(failure).toEqual(new Transition.Refused({ why: Transition.Why.Input() }))
  expect(failure.reason).toBe(inputReason)
  expect(failure.message).toBe(inputReason)
})

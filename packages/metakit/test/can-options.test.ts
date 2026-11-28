import { Eq, Expr, Transition, Verdict } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import * as Operation from '@doeixd/metakit/operation'
import { Schema } from 'effect'
import { expect, it } from 'vitest'

const add = Operation.define({
  id: 'test.canOptions.add',
  version: 1,
  args: [Schema.Int, Schema.Int],
  returns: Schema.Int,
  nulls: 'strict',
  claims: { identity: { value: 0, side: 'both' } },
})
const foreign = Operation.implementations(
  'can-options',
  Operation.implement(add, (left, right) => left + right),
)
const verified = {
  foreign,
  rewritePolicy: Expr.RewritePolicy.verified([]),
} satisfies Expr.ReaderOptions
const trustedOptions = {
  foreign,
  rewritePolicy: Expr.RewritePolicy.trusted,
} satisfies Expr.ReaderOptions

const State = Schema.Struct({ total: Schema.Int })
const Confirm = Transition.make({
  state: State,
  input: Schema.Struct({}),
  when: ({ state }) => Eq.is(add(state.total, 0), state.total),
  apply: () => [],
})
const machine = Machine.make({ state: State, transitions: { Confirm } })
const state = { total: 5 }

it('Transition.can agrees with Expr.judge on the rewrite policy', () => {
  const withoutEvidence = Expr.judge(Confirm.when, {}, verified)
  expect(Verdict.isUnknown(withoutEvidence)).toBe(true)
  expect(Transition.can(Confirm, {}, verified)).toEqual(withoutEvidence)

  const withoutPolicy = Expr.judge(Confirm.when, {}, { foreign })
  expect(Verdict.isUnknown(withoutPolicy)).toBe(true)
  expect(Transition.can(Confirm, {}, { foreign })).toEqual(withoutPolicy)

  const trusted = Expr.judge(Confirm.when, {}, trustedOptions)
  expect(Verdict.isTrue(trusted)).toBe(true)
  expect(Transition.can(Confirm, {}, trustedOptions)).toEqual(trusted)
})

it('Machine.intent uses reader options to judge its guard', () => {
  const confirm = Machine.intent(machine, 'Confirm', { foreign })
  const judged = Expr.judge(Confirm.when, { state }, { foreign })
  expect(Verdict.isTrue(judged)).toBe(true)
  expect(confirm.can({ state })).toEqual(judged)

  const verifiedConfirm = Machine.intent(machine, 'Confirm', verified)
  expect(Verdict.isUnknown(verifiedConfirm.can({}))).toBe(true)

  const trustedConfirm = Machine.intent(machine, 'Confirm', trustedOptions)
  expect(Verdict.isTrue(trustedConfirm.can({}))).toBe(true)
})

it('Machine.affordances uses reader options to classify its guard', () => {
  expect(Machine.affordances(machine, state, { foreign })).toEqual({
    available: ['Confirm'],
    disabled: [],
    pending: [],
  })
  expect(Machine.affordances(machine, {}, verified)).toEqual({
    available: [],
    disabled: [],
    pending: ['Confirm'],
  })
  expect(Machine.affordances(machine, {}, trustedOptions)).toEqual({
    available: ['Confirm'],
    disabled: [],
    pending: [],
  })
})

import { Schema } from 'effect'
import { Num, Ord, Transition } from 'metakit'
import { describe, expect, it } from 'vitest'
import { Form } from '../src/index.js'
import { Declared } from '../src/metakit.js'

const State = Schema.Struct({ balance: Schema.Int })
const TransferInput = Schema.Struct({
  amount: Schema.Int.check(Schema.isGreaterThan(0)),
})

const Withdraw = Transition.make({
  state: State,
  input: TransferInput,
  when: ({ state, input }) => Ord.lte(input.amount, state.balance),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.sub(state.balance, input.amount)),
  ],
})

const WithdrawForm = Form.make('Withdraw', Form.input(TransferInput), {
  inputs: Declared.inputs(TransferInput),
})

const declared = Declared.of(WithdrawForm)

describe('foldkit-form/metakit Declared.disabled (Bout 3.7)', () => {
  it('disables the submit control only when the transition guard provably refuses the entered values', () => {
    const empty = WithdrawForm.bundle.init(undefined).model
    // Empty input -> guard is Unknown -> not disabled yet.
    expect(declared.disabled(empty, Withdraw, { balance: 100 })).toBe(false)

    const tooMuch = WithdrawForm.bundle.update(
      empty,
      WithdrawForm.Message.Changed({ key: 'amount', value: '150' }),
    ).model
    // 150 > 100 -> guard is False -> disabled!
    expect(declared.disabled(tooMuch, Withdraw, { balance: 100 })).toBe(true)

    const ok = WithdrawForm.bundle.update(
      empty,
      WithdrawForm.Message.Changed({ key: 'amount', value: '50' }),
    ).model
    // 50 <= 100 -> guard is True -> enabled!
    expect(declared.disabled(ok, Withdraw, { balance: 100 })).toBe(false)
  })
})

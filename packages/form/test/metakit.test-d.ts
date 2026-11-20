/**
 * `foldkit-form/metakit` is typed by the form's own keys and value: a key the
 * input lacks, a transition over another input, or a state of the wrong shape
 * does not compile.
 */
import { Option, Schema } from 'effect'
import { Eq, Expr, Num, Transition, type Verdict } from 'metakit'
import { expectTypeOf } from 'vitest'
import { Form, type Control } from '../src/index.js'
import { Declared } from '../src/metakit.js'

const Account = Schema.Struct({ balance: Schema.Int, frozen: Schema.Boolean })
const WithdrawInput = Schema.Struct({ amount: Schema.Int, memo: Schema.String })
const Withdraw = Transition.make({
  state: Account,
  input: WithdrawInput,
  when: ({ state, input }) =>
    Expr.all(Eq.is(state.frozen, false), Num.lte(input.amount, state.balance)),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.sub(state.balance, input.amount)),
  ],
})
const WithdrawForm = Form.make('Withdraw', Form.input(WithdrawInput))
const declared = Declared.of(WithdrawForm)

// Constraints by the input's keys, each typed by its own key.
expectTypeOf(declared.constraints.amount.key).toEqualTypeOf<'amount'>()
expectTypeOf(declared.constraints.memo.attributes.min).toEqualTypeOf<Option.Option<string>>()
// @ts-expect-error a key the input does not have
void declared.constraints.amont

// A transition over the form's own value, with the state it is over.
expectTypeOf(declared.can(WithdrawForm.initial, Withdraw, { balance: 100 })).toEqualTypeOf<
  Verdict.Verdict<never>
>()
// @ts-expect-error a state of the wrong shape
declared.can(WithdrawForm.initial, Withdraw, { balance: 'all of it' })

const Other = Transition.make({
  state: Account,
  input: Schema.Struct({ amount: Schema.String }),
  apply: () => [],
})
// @ts-expect-error a transition whose input is not this form's value
declared.can(WithdrawForm.initial, Other)

// @ts-expect-error a Model of another form
declared.can(Form.make('Other', Form.input(Account)).initial, Withdraw)

// Domain controls by the Schema's keys.
const controls = Declared.inputs(WithdrawInput)
expectTypeOf(controls.amount).toEqualTypeOf<Control | undefined>()
// @ts-expect-error a key the Schema does not have
void controls.amont

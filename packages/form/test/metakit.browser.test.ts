/// <reference types="@vitest/browser-playwright" />
/**
 * On a real page: an amount input takes the bounds and step its Money Schema
 * declares, and the browser's own range check agrees with them; a Withdraw
 * button is refused (`aria-disabled`, as a form's own submit is) while the
 * transition's guard is false for the amount typed, and pressable while the
 * guard is true or not yet decided.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Eq, Expr, Transition, Verdict } from '@doeixd/metakit'
import { Money } from '@doeixd/metakit/domain'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Form } from '../src/index.js'
import { Declared } from '../src/metakit.js'

const Usd = Money.make('USD')
const Account = Schema.Struct({ balance: Usd, frozen: Schema.Boolean })
const WithdrawInput = Schema.Struct({
  amount: Usd.pipe(
    Expr.refine($ =>
      Expr.all(Money.gt($, Money.minor('USD', 0)), Money.lte($, Money.minor('USD', 1_000_000))),
    ),
  ),
})
const Withdraw = Transition.make({
  state: Account,
  input: WithdrawInput,
  when: ({ state, input }) =>
    Expr.all(Eq.is(state.frozen, false), Money.lte(input.amount, state.balance)),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Money.sub(state.balance, input.amount)),
  ],
})
const WithdrawForm = Form.make('Withdraw', Form.input(WithdrawInput), {
  inputs: Declared.inputs(WithdrawInput),
})
const { constraints, can } = Declared.of(WithdrawForm)
const account = { balance: Money.minor('USD', 10_000), frozen: false }

type Model = typeof WithdrawForm.initial
type Message = typeof WithdrawForm.Message.Type

const view = (model: Model, h: HtmlBuilder<Message>) => {
  const { type, inputMode, min, max, step } = constraints.amount.attributes
  const verdict = can(model, Withdraw, account)
  return h.div(
    [],
    [
      h.input([
        h.Id('amount'),
        h.AriaLabel('Amount'),
        ...Option.toArray(Option.map(type, h.Type)),
        ...Option.toArray(Option.map(inputMode, h.InputMode)),
        ...Option.toArray(Option.map(min, h.Min)),
        ...Option.toArray(Option.map(max, h.Max)),
        ...Option.toArray(Option.map(step, h.Step)),
        h.Value(model.fields.amount.value),
        h.OnInput(value => WithdrawForm.Message.Changed({ key: 'amount', value })),
      ]),
      h.button(
        [
          h.Id('withdraw'),
          h.DataAttribute('verdict', verdict._tag),
          // Refused only on False: Unknown is not decided here, and the
          // transition's own run decides it on the press.
          ...(Verdict.isFalse(verdict) ? [h.AriaDisabled(true)] : []),
        ],
        ['Withdraw'],
      ),
    ],
  )
}

afterEach(() => document.body.replaceChildren())

const mount = async () => {
  const container = document.createElement('div')
  container.id = 'declared-form'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: WithdrawForm.bundle.Model,
      container,
      init: () => ({ model: WithdrawForm.initial }),
      update: (model: Model, message: Message) => {
        const result = WithdrawForm.bundle.update(model, message, undefined)
        return { model: result.model, commands: result.commands ?? [] }
      },
      view,
    }),
  )
  await vi.waitFor(() => expect(amount()).not.toBeNull())
  return handle
}

const amount = () => document.querySelector<HTMLInputElement>('#amount')!
const button = () => document.querySelector<HTMLButtonElement>('#withdraw')!

it('gives the amount input the bounds and step its Schema declares, which the browser enforces', async () => {
  const handle = await mount()
  try {
    expect(amount().type).toBe('number')
    expect(amount().min).toBe('0.01')
    expect(amount().max).toBe('10000.00')
    expect(amount().step).toBe('0.01')
    expect(amount().inputMode).toBe('decimal')

    await userEvent.fill(amount(), '20000')
    expect(amount().validity.rangeOverflow).toBe(true)
    await userEvent.fill(amount(), '0')
    expect(amount().validity.rangeUnderflow).toBe(true)
    await userEvent.fill(amount(), '12.345')
    expect(amount().validity.stepMismatch).toBe(true)
    await userEvent.fill(amount(), '12.34')
    expect(amount().validity.valid).toBe(true)
  } finally {
    handle.dispose()
  }
})

it('refuses Withdraw while the guard is false, and lets it be pressed once it is true', async () => {
  const handle = await mount()
  try {
    // Nothing typed: the guard reads an amount not entered, so it is undecided, not refused.
    expect(button().dataset['verdict']).toBe('Unknown')
    expect(button().hasAttribute('aria-disabled')).toBe(false)

    await userEvent.fill(amount(), '500')
    await vi.waitFor(() => expect(button().getAttribute('aria-disabled')).toBe('true'))
    expect(button().dataset['verdict']).toBe('False')

    await userEvent.fill(amount(), '50')
    await vi.waitFor(() => expect(button().hasAttribute('aria-disabled')).toBe(false))
    expect(button().dataset['verdict']).toBe('True')
  } finally {
    handle.dispose()
  }
})

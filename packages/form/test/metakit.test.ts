/**
 * A form reading a metakit declaration: the input attributes its Schema's
 * bounds and domain types imply, the controls those domain types call for, and
 * a guarded Transition judged over the values entered so far, Unknown while
 * the guard reads something not entered.
 */
import { Option, Schema } from 'effect'
import { Eq, Expr, Ord, Transition, Verdict } from 'metakit'
import { CalendarDay, Money } from 'metakit/domain'
import { describe, expect, it } from 'vitest'
import { Form } from '../src/index.js'
import { Declared } from '../src/metakit.js'

const Usd = Money.make('USD')
const PositiveUsd = Usd.pipe(Expr.refine($ => Money.gt($, Money.minor('USD', 0))))

const Booking = Schema.Struct({
  amount: PositiveUsd,
  guests: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThan(11)),
  // Each side bounded twice: the tighter bound stands.
  seats: Schema.Int.check(
    Schema.isGreaterThanOrEqualTo(2),
    Schema.isGreaterThan(0),
    Schema.isLessThanOrEqualTo(8),
    Schema.isLessThan(20),
  ),
  nights: Schema.Int.check(Schema.isBetween({ minimum: 0.5, maximum: 9.5 })),
  share: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThan(1)),
  arrives: CalendarDay.schema.pipe(
    Expr.refine($ => Ord.gte($, CalendarDay.parseIsoUnsafe('2026-01-01'))),
  ),
  method: Schema.Literals(['cash', 'card']),
  note: Schema.String,
})
const BookingForm = Form.make('Booking', Form.input(Booking), { inputs: Declared.inputs(Booking) })
const declared = Declared.of(BookingForm)

const attributes = (
  type: string | undefined,
  inputMode: string | undefined,
  step: string | undefined,
  min: string | undefined,
  max: string | undefined,
) => ({
  type: Option.fromUndefinedOr(type),
  inputMode: Option.fromUndefinedOr(inputMode),
  step: Option.fromUndefinedOr(step),
  min: Option.fromUndefinedOr(min),
  max: Option.fromUndefinedOr(max),
})

describe('Constraints from the input Schema', () => {
  it.each([
    // An exclusive bound of a whole key is the next whole value; money shows in whole units.
    ['amount', attributes('number', 'decimal', '0.01', '0.01', undefined)],
    ['guests', attributes('number', 'numeric', '1', '1', '10')],
    ['seats', attributes('number', 'numeric', '1', '2', '8')],
    // A fractional bound of a whole key rounds inwards.
    ['nights', attributes('number', 'numeric', '1', '1', '9')],
    // HTML has no exclusive bound: a number that is not whole keeps only its inclusive ones.
    ['share', attributes('number', 'decimal', 'any', '0', undefined)],
    ['arrives', attributes('date', undefined, undefined, '2026-01-01', undefined)],
    ['method', attributes(undefined, undefined, undefined, undefined, undefined)],
    ['note', attributes(undefined, undefined, undefined, undefined, undefined)],
  ] as const)('%s takes the attributes its declaration implies', (key, expected) => {
    expect(declared.constraints[key].attributes).toEqual(expected)
    expect(declared.constraints[key].key).toBe(key)
  })

  it('carries what Inspect read: the domain type, the literals, the bounds as values', () => {
    expect(declared.constraints.amount.domain).toEqual(
      Option.some({ kind: 'money', currency: 'USD', scale: 2 }),
    )
    expect(declared.constraints.amount.exclusiveMin).toEqual(Option.some(0))
    expect(declared.constraints.method.literals).toEqual(Option.some(['cash', 'card']))
    expect(declared.constraints.note.kind).toBe('string')
  })
})

describe('Controls for domain types', () => {
  const controls = Declared.inputs(Booking)

  it('gives a CalendarDay key a date control and a Money key an amount control, and no other', () => {
    expect(Object.keys(controls).sort()).toEqual(['amount', 'arrives'])
    expect(controls.arrives !== undefined && Declared.CalendarDay.is(controls.arrives)).toBe(true)
    expect(controls.amount !== undefined && Declared.Decimal.is(controls.amount)).toBe(true)
    expect(BookingForm.controlsByKey.guests.control.kind).toBe('Number')
  })

  const edit = (key: 'amount' | 'arrives', value: string) =>
    BookingForm.bundle.update(
      BookingForm.initial,
      BookingForm.Message.Changed({ key, value }),
      undefined,
    ).model

  it('reads an amount in whole units as the integer count of minor units', () => {
    expect(BookingForm.partial(edit('amount', '12.50')).amount).toBe(1250)
    expect(BookingForm.field(edit('amount', '12.505'), 'amount')).toMatchObject({
      _tag: 'Invalid',
      errors: ['Enter an amount'],
    })
  })

  it('reads a day as the epoch day it names, and refuses one that does not exist', () => {
    expect(BookingForm.partial(edit('arrives', '2026-03-01')).arrives).toBe(
      CalendarDay.parseIsoUnsafe('2026-03-01'),
    )
    expect(BookingForm.field(edit('arrives', '2026-02-30'), 'arrives')).toMatchObject({
      _tag: 'Invalid',
      errors: ['Enter a date'],
    })
  })

  it('shows a filled value as the control writes it', () => {
    const filled = BookingForm.fill(BookingForm.initial, {
      amount: Money.minor('USD', 1250),
      arrives: CalendarDay.parseIsoUnsafe('2026-03-01'),
    }).model
    expect(filled.fields.amount.value).toBe('12.50')
    expect(filled.fields.arrives.value).toBe('2026-03-01')
  })
})

describe('Whether a transition would go through now', () => {
  const Account = Schema.Struct({ balance: Usd, frozen: Schema.Boolean })
  const WithdrawInput = Schema.Struct({ amount: PositiveUsd })
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
  const { can } = Declared.of(WithdrawForm)
  const open = { balance: Money.minor('USD', 10000), frozen: false }
  const typed = (amount: string) =>
    WithdrawForm.bundle.update(
      WithdrawForm.initial,
      WithdrawForm.Message.Changed({ key: 'amount', value: amount }),
      undefined,
    ).model

  it.each([
    ['an amount within the balance', typed('50.00'), open, 'True'],
    ['an amount over the balance', typed('500.00'), open, 'False'],
    ['nothing entered yet', WithdrawForm.initial, open, 'Unknown'],
    // A draft that does not read is not a value: it refuses nothing.
    ['a draft that does not read', typed('lots'), open, 'Unknown'],
    // Refused whatever the amount: False however the unknown part turns out.
    ['a frozen account, nothing entered', WithdrawForm.initial, { ...open, frozen: true }, 'False'],
  ] as const)('%s is %s', (_, model, state, verdict) => {
    expect(can(model, Withdraw, state)._tag).toBe(verdict)
  })

  it('is Unknown with no state given, and with only the part of it the guard does not decide on', () => {
    expect(Verdict.isUnknown(can(typed('50.00'), Withdraw))).toBe(true)
    expect(Verdict.isUnknown(can(typed('50.00'), Withdraw, { frozen: false }))).toBe(true)
  })
})

/**
 * A form reading a metakit declaration: the input attributes its Schema's
 * bounds and domain types imply, the controls those domain types call for, and
 * a guarded Transition judged over the values entered so far, Unknown while
 * the guard reads something not entered.
 */
import { Option, Schema } from 'effect'
import { Eq, Expr, Num, Ord, Transition, Verdict } from '@doeixd/metakit'
import { CalendarDay, Money } from '@doeixd/metakit/domain'
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
// Made in each test, so a refusal in `Declared.of` fails the tests rather than the file.
const declared = () => Declared.of(BookingForm)

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
    expect(declared().constraints[key].attributes).toEqual(expected)
    expect(declared().constraints[key].key).toBe(key)
  })

  it('carries what Inspect read: the domain type, the literals, the bounds as values', () => {
    expect(declared().constraints.amount.domain).toEqual(
      Option.some({ kind: 'money', currency: 'USD', scale: 2 }),
    )
    expect(declared().constraints.amount.exclusiveMin).toEqual(Option.some(0))
    expect(declared().constraints.method.literals).toEqual(Option.some(['cash', 'card']))
    expect(declared().constraints.note.kind).toBe('string')
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
  const withdraw = () => Declared.of(WithdrawForm)
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
  ] as const)('%s gives the verdict in the table', (_, model, state, verdict) => {
    expect(withdraw().can(model, Withdraw, state)._tag).toBe(verdict)
  })

  it('is Unknown with no state given, and with only the part of it the guard does not decide on', () => {
    expect(Verdict.isUnknown(withdraw().can(typed('50.00'), Withdraw))).toBe(true)
    expect(Verdict.isUnknown(withdraw().can(typed('50.00'), Withdraw, { frozen: false }))).toBe(
      true,
    )
  })
})

describe('Rules over several keys', () => {
  const StayFields = {
    arrives: CalendarDay.schema,
    leaves: CalendarDay.schema,
    guests: Schema.Int.check(Schema.isGreaterThan(0, { message: 'Bring someone' })),
  }
  const Stay = Schema.Struct(StayFields).pipe(
    Expr.refine($ => CalendarDay.before($.arrives, $.leaves), {
      message: 'Leave after you arrive',
    }),
  )
  const StayForm = Form.make('Stay', Form.input(Stay), { inputs: Declared.inputs(Stay) })
  const declared = () => Declared.of(StayForm)
  const day = (iso: string) => CalendarDay.parseIsoUnsafe(iso)

  const entered = (...edits: ReadonlyArray<readonly [keyof typeof StayFields, string]>) =>
    edits.reduce(
      (model, [key, value]) =>
        StayForm.bundle.update(model, StayForm.Message.Changed({ key, value }), undefined).model,
      StayForm.initial,
    )
  const backwards = entered(['arrives', '2026-03-05'], ['leaves', '2026-03-01'], ['guests', '2'])

  it('reports a rule the values break, with the keys it reads and its message', () => {
    const [failure, ...rest] = declared().failures(backwards)
    expect(rest).toEqual([])
    expect(failure?.keys).toEqual(['arrives', 'leaves'])
    expect(failure?.message).toEqual(Option.some('Leave after you arrive'))
    expect(failure !== undefined && Expr.show(failure.rule)).toContain('arrives')
  })

  it('reports nothing for a rule still undecided: a key it reads is not entered, or does not read', () => {
    expect(declared().failures(StayForm.initial)).toEqual([])
    expect(declared().failures(entered(['arrives', '2026-03-05']))).toEqual([])
    expect(declared().failures(entered(['arrives', '2026-03-05'], ['leaves', 'soon']))).toEqual([])
    expect(
      declared().failures(entered(['arrives', '2026-03-01'], ['leaves', '2026-03-05'])),
    ).toEqual([])
  })

  it('leaves a rule on one key to that key, which already shows it', () => {
    const none = entered(['arrives', '2026-03-01'], ['leaves', '2026-03-05'], ['guests', '0'])
    expect(declared().failures(none)).toEqual([])
    expect(declared().field(none, 'guests')).toMatchObject({
      _tag: 'Invalid',
      errors: ['Bring someone'],
    })
  })

  it("shows a broken rule's message on each key it reads, after the key's own errors, and on no other", () => {
    expect(declared().field(backwards, 'leaves')).toMatchObject({
      _tag: 'Invalid',
      errors: ['Leave after you arrive'],
    })
    expect(declared().field(backwards, 'arrives')._tag).toBe('Invalid')
    expect(declared().field(backwards, 'guests')).toBe(StayForm.field(backwards, 'guests'))
    const refused = StayForm.bundle.update(
      backwards,
      StayForm.Message.Refused({ key: 'leaves', error: 'Fully booked', value: day('2026-03-01') }),
      undefined,
    ).model
    expect(declared().field(refused, 'leaves')).toMatchObject({
      errors: ['Fully booked', 'Leave after you arrive'],
    })
  })

  it('gives back the form field itself while no rule is broken', () => {
    const fine = entered(['arrives', '2026-03-01'], ['leaves', '2026-03-05'])
    expect(declared().field(fine, 'leaves')).toBe(StayForm.field(fine, 'leaves'))
  })

  describe('a rule given no message', () => {
    const Party = Schema.Struct({ adults: Schema.Int, children: Schema.Int }).pipe(
      Expr.refine($ => Num.lte($.children, $.adults)),
    )
    const PartyForm = Form.make('Party', Form.input(Party))

    it('is refused when nothing says what to show for it', () => {
      expect(() => Declared.of(PartyForm)).toThrow(/has no message/)
    })

    it('shows the words `unworded` gives, and reports no message of its own', () => {
      const party = Declared.of(PartyForm, {
        unworded: failure => `Check ${failure.keys.join(' and ')}`,
      })
      const model = [
        PartyForm.Message.Changed({ key: 'adults', value: '1' }),
        PartyForm.Message.Changed({ key: 'children', value: '3' }),
      ].reduce(
        (at, message) => PartyForm.bundle.update(at, message, undefined).model,
        PartyForm.initial,
      )
      expect(party.failures(model).map(failure => failure.message)).toEqual([Option.none()])
      expect(party.field(model, 'children')).toMatchObject({
        errors: ['Check children and adults'],
      })
    })
  })
})

/**
 * A product past ±(2^53−1) is one metakit refuses to evaluate. The Schema's
 * rule and `Transition.run` both reject such values, so it is decided: not
 * something a value entered later could turn into a yes.
 */
describe('A rule or guard whose evaluation is refused', () => {
  const Order = Schema.Struct({ quantity: Schema.Int, price: Schema.Int }).pipe(
    Expr.refine($ => Num.lte(Num.mul($.quantity, $.price), 1_000_000), {
      message: 'Too large an order',
    }),
  )
  const OrderForm = Form.make('Order', Form.input(Order))
  const order = () => Declared.of(OrderForm)
  const entered = (...edits: ReadonlyArray<readonly ['quantity' | 'price', string]>) =>
    edits.reduce(
      (model, [key, value]) =>
        OrderForm.bundle.update(model, OrderForm.Message.Changed({ key, value }), undefined).model,
      OrderForm.initial,
    )
  const huge = String(Number.MAX_SAFE_INTEGER)
  const overflowing = entered(['quantity', huge], ['price', '2'])

  it('is what the Schema refuses too', () => {
    expect(Schema.is(Order)({ quantity: Number.MAX_SAFE_INTEGER, price: 2 })).toBe(false)
  })

  it('is a failure of the rule, shown on the keys it reads', () => {
    expect(
      order()
        .failures(overflowing)
        .map(failure => failure.keys),
    ).toEqual([['quantity', 'price']])
    expect(order().field(overflowing, 'price')).toMatchObject({
      _tag: 'Invalid',
      errors: ['Too large an order'],
    })
  })

  it('is still undecided while a key the rule reads is not entered', () => {
    expect(order().failures(entered(['quantity', huge]))).toEqual([])
  })

  const Stock = Schema.Struct({ held: Schema.Int })
  const Restock = Transition.make({
    state: Stock,
    input: Order,
    when: ({ state, input }) => Num.lte(Num.add(state.held, input.quantity), 5_000),
    apply: ({ state, input }) => [Transition.set(state.held, Num.add(state.held, input.quantity))],
  })

  it('makes `can` False, as `Transition.run` refuses it; a missing value stays Unknown', () => {
    const full = { held: Number.MAX_SAFE_INTEGER }
    const model = entered(['quantity', '1'], ['price', '2'])
    expect(order().can(model, Restock, full)._tag).toBe('False')
    expect(Transition.run(Restock, full, { quantity: 1, price: 2 })._tag).toBe('Failure')
    expect(order().can(entered(['price', '2']), Restock, full)._tag).toBe('Unknown')
    expect(order().can(model, Restock, { held: 10 })._tag).toBe('True')
  })
})

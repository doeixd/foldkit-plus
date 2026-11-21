import { Schema } from 'effect'
import { Form } from 'foldkit-form'
import { Declared } from 'foldkit-form/metakit'
import { Expr, Ord } from 'metakit'
import { CalendarDay, Money } from 'metakit/domain'
import { DeclaredView } from '../src/declared.js'

const Usd = Money.make('USD')

/** Two days that must come in order, and an amount between a cent and 10,000.00. */
export const StayInput = Schema.Struct({
  arrives: CalendarDay.schema.pipe(
    Expr.refine($ => Ord.gte($, CalendarDay.parseIsoUnsafe('2026-01-01'))),
  ),
  leaves: CalendarDay.schema.pipe(
    Expr.refine($ => Ord.lte($, CalendarDay.parseIsoUnsafe('2026-12-31'))),
  ),
  deposit: Usd.pipe(
    Expr.refine($ =>
      Expr.all(Money.gt($, Money.minor('USD', 0)), Money.lte($, Money.minor('USD', 1_000_000))),
    ),
  ),
  note: Schema.String,
}).pipe(
  Expr.refine($ => CalendarDay.before($.arrives, $.leaves), { message: 'Leave after you arrive' }),
)

export const Stay = Form.make('Stay', Form.input(StayInput), { inputs: Declared.inputs(StayInput) })
export const declared = Declared.of(Stay)
/** The form and its declarations as `FormView` takes them. */
export const stay = DeclaredView.of(Stay, declared)

export type StayModel = typeof Stay.initial
export type StayMessage = typeof Stay.Message.Type

/** The form's Model after each Message in turn. */
export const after = (...messages: ReadonlyArray<StayMessage>): StayModel =>
  messages.reduce(
    (model, message) => Stay.bundle.update(model, message, undefined).model,
    Stay.initial,
  )

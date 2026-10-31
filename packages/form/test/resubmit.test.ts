/**
 * A second submit of a form that changed nothing keeps the Model it was
 * given, so a parent that refuses the value (a write still in flight) returns
 * the Model unchanged and nothing renders or records a step.
 */
import { Schema } from 'effect'
import { Entity, Relation } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Form } from '../src/index.js'

const Line = Entity.define('Line', Schema.Struct({ id: Schema.String, note: Schema.String }))
const Order = Entity.relate(
  {
    Line,
    Order: Entity.define(
      'Order',
      Schema.Struct({
        id: Schema.String,
        title: Schema.String.check(Schema.isMinLength(1)),
        body: Schema.String,
      }),
    ),
  },
  { Order: { lines: Relation.many(Line) } },
)
const NewLine = Entity.input(Order.Line, Schema.Struct({ note: Schema.String }))
const LineForm = Form.make('Line', NewLine)
const OrderForm = Form.make(
  'Order',
  Entity.input(
    Order.Order,
    Schema.Struct({
      title: Order.Order.fields.title.schema,
      body: Schema.String,
      lines: Schema.Array(NewLine.schema),
    }),
    { lines: Relation.nested(Order.Order.relations.lines, NewLine) },
  ),
  { nested: { lines: LineForm } },
)
type Model = typeof OrderForm.initial
type Message = typeof OrderForm.Message.Type

const run = (model: Model, messages: ReadonlyArray<Message>): Model =>
  messages.reduce((held, message) => OrderForm.bundle.update(held, message, undefined).model, model)

const filled = run(OrderForm.initial, [
  OrderForm.Message.Changed({ key: 'title', value: 'Order' }),
  OrderForm.Message.RowAdded({ key: 'lines' }),
])

describe('A submit that changes nothing', () => {
  it('hands the value out again and keeps the Model, rows included', () => {
    const first = OrderForm.bundle.update(filled, OrderForm.Message.Submitted(), undefined)
    expect(first.outMessage?._tag).toBe('Submitted')
    const second = OrderForm.bundle.update(first.model, OrderForm.Message.Submitted(), undefined)
    expect(second.outMessage).toEqual(first.outMessage)
    expect(second.model).toBe(first.model)
  })

  it('keeps the Model of a form still invalid, and hands nothing out', () => {
    const failed = run(OrderForm.initial, [OrderForm.Message.Submitted()])
    expect(OrderForm.field(failed, 'title')._tag).toBe('Invalid')
    const again = OrderForm.bundle.update(failed, OrderForm.Message.Submitted(), undefined)
    expect(again.outMessage).toBeUndefined()
    expect(again.model).toBe(failed)
  })

  it('marks the first submit as attempted', () => {
    const first = OrderForm.bundle.update(filled, OrderForm.Message.Submitted(), undefined)
    expect(first.model).not.toBe(filled)
    expect(OrderForm.attempted(first.model)).toBe(true)
  })
})

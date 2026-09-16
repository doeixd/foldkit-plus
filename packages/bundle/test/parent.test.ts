/**
 * The parent scope: placing, linking, and assembling with the parent's types
 * inferred from its Schemas.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Bundle, Link } from '../src/index.js'
import { Counter, CounterMessage, CounterModel } from './fixture.js'

const { resources: _socket, at: _at, each: _each, ...plainSpec } = Counter
const Plain = Bundle.make({ ...plainSpec, name: 'Plain' })

const Left = Bundle.declare(Counter, 'left')
const Rows = Bundle.declareEach(Plain, 'rows')
const GotRightMessage = Link.wrapper('GotRightMessage', CounterMessage)
const GotBoxMessage = Link.keyedWrapper('GotBoxMessage', CounterMessage)

const Model = Schema.Struct({
  ...Left.fields,
  ...Rows.fields,
  right: CounterModel,
  inline: CounterModel,
  boxes: Schema.Record(Schema.String, CounterModel),
  reached: Schema.Array(Schema.Number),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  Reset: {},
  ...Left.cases,
  ...Rows.cases,
  ...GotRightMessage.cases,
  GotInlineMessage: { message: CounterMessage },
  ...GotBoxMessage.cases,
})

const Page = Bundle.parent({ Model, Message })
const args = { limit: 2, start: 0 }

// No type arguments, and onOut's model is typed from the scope.
const LeftPlaced = Page.at(Left, {
  args,
  onOut: out => model => ({ model: { ...model, reached: [...model.reached, out.count] } }),
})
const Inline = Page.place(Plain, 'inline', { args, onOut: Bundle.ignore })
const Right = Plain.at(Page.link.field('right', GotRightMessage), {
  args,
  onOut: Bundle.ignore,
})
const RowsPlaced = Page.each(Rows, { args, onOut: Bundle.ignore })
const Boxes = Plain.each(Page.link.collection('boxes', GotBoxMessage), {
  args,
  onOut: Bundle.ignore,
})

const placements = Page.assemble(LeftPlaced, Inline, Right, RowsPlaced, Boxes)

const counter = { count: 0, running: false }
const initial: Model = {
  left: counter,
  rows: {},
  right: counter,
  inline: counter,
  boxes: {},
  reached: [],
}

describe('Bundle.parent', () => {
  it('places by declaration, by field name, and through a scope Link, with the conventional wrapper', () => {
    expect([LeftPlaced.key, Inline.key, Right.key, RowsPlaced.key, Boxes.key]).toEqual([
      'Counter@left',
      'Plain@inline',
      'Plain@right',
      'Plain@rows[]',
      'Plain@boxes[]',
    ])
    expect(Inline.link.messages).toEqual(['GotInlineMessage'])
  })

  it('routes every form through one assembly and folds a contextually typed onOut', () => {
    const update = placements.update()
    const once = update(initial, Left.wrapper.make(CounterMessage.Incremented()))
    const twice = update(once.model, Left.wrapper.make(CounterMessage.Incremented()))
    expect(twice.model.reached).toEqual([2])
    expect(
      update(initial, { _tag: 'GotInlineMessage', message: CounterMessage.Incremented() }).model
        .inline.count,
    ).toBe(1)
    expect(
      update(initial, GotRightMessage.make(CounterMessage.Incremented())).model.right.count,
    ).toBe(1)
    const withRow = RowsPlaced.add('a')(initial).model
    expect(
      update(withRow, Rows.wrapper.make('a', CounterMessage.Incremented())).model.rows,
    ).toEqual({
      a: { count: 1, running: false },
    })
    const withBox = Boxes.add('b')(initial).model
    expect(
      Option.isSome(
        placements.route(withBox, GotBoxMessage.make('b', CounterMessage.Incremented())),
      ),
    ).toBe(true)
  })

  it('merges every placement’s Subscriptions', () => {
    expect(Object.keys(placements.subscriptions())).toEqual([
      'Counter@left/ticks',
      'Plain@inline/ticks',
      'Plain@right/ticks',
      'Plain@rows[]/ticks',
      'Plain@boxes[]/ticks',
    ])
  })
})

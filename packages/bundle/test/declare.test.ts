/**
 * One declaration per placement: the conventional wrapper, the Model field and
 * Message cases to spread, and placement once the parent exists.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Bundle } from '../src/index.js'
import { Counter, CounterMessage } from './fixture.js'

const { resources: _socket, at: _at, each: _each, ...plainSpec } = Counter
const Plain = Bundle.make({ ...plainSpec, name: 'Plain' })

const Left = Bundle.declare(Counter, 'left')
const Rows = Bundle.declareEach(Plain, 'rows')

const Model = Schema.Struct({ ...Left.fields, ...Rows.fields, total: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Reset: {}, ...Left.cases, ...Rows.cases })
type Message = typeof Message.Type

const onOut = () => (model: Model) => ({ model })
const LeftPlaced = Left.at<Model>()({ args: { limit: 5, start: 2 }, onOut })
const RowsPlaced = Rows.each<Model>()({ args: { limit: 5, start: 0 }, onOut: () => onOut() })
const placements = Bundle.assemble<Model, Message>()([LeftPlaced, RowsPlaced])

describe('Bundle.declare', () => {
  it('names the wrapper by Foldkit convention and contributes the field and cases', () => {
    expect(Left.wrapper.tag).toBe('GotLeftMessage')
    expect(Rows.wrapper.tag).toBe('GotRowsMessage')
    expect(Object.keys(Model.fields)).toEqual(['left', 'rows', 'total'])
    expect(
      Schema.decodeUnknownSync(Message)({
        _tag: 'GotRowsMessage',
        key: 'a',
        message: { _tag: 'Started' },
      }),
    ).toEqual(Rows.wrapper.make('a', CounterMessage.Started()))
  })

  it('places a single child and a collection that route like hand-built links', () => {
    const initial = placements.init({ left: { count: 0, running: false }, rows: {}, total: 0 })
    expect(initial.model.left).toEqual({ count: 2, running: false })
    const added = RowsPlaced.add('a')(initial.model)
    const routed = Option.getOrThrow(
      placements.route(added.model, Rows.wrapper.make('a', CounterMessage.Incremented())),
    )
    expect(routed.model.rows).toEqual({ a: { count: 1, running: false } })
    const left = Option.getOrThrow(
      placements.route(routed.model, Left.wrapper.make(CounterMessage.Incremented())),
    )
    expect(left.model.left.count).toBe(3)
    expect(LeftPlaced.key).toBe('Counter@left')
    expect(RowsPlaced.key).toBe('Plain@rows[]')
  })
})

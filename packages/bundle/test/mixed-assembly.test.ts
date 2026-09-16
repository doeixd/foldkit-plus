/**
 * A single placement and a collection in one assembly: one list routes both,
 * init covers only the single placement, and the Subscriptions of both merge.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Bundle, Link } from '../src/index.js'
import { Counter, CounterMessage, CounterModel } from './fixture.js'

const { resources: _socket, at: _at, each: _each, ...withoutResources } = Counter
const Plain = Bundle.make({ ...withoutResources, name: 'Plain' })

const GotMain = Link.wrapper('GotMainMessage', CounterMessage)
const GotRow = Link.keyedWrapper('GotRowMessage', CounterMessage)
const Model = Schema.Struct({
  main: CounterModel,
  rows: Schema.Record(Schema.String, CounterModel),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ Noop: {}, ...GotMain.cases, ...GotRow.cases })
type Message = typeof Message.Type

const config = { args: { limit: 9, start: 3 }, onOut: () => (model: Model) => ({ model }) }
const Main = Counter.at(Link.field<Model>()('main', GotMain), config)
const Rows = Plain.each(Link.collection<Model>()('rows', GotRow), {
  args: config.args,
  onOut: () => model => ({ model }),
})
const assembly = Bundle.assemble<Model, Message>()([Main, Rows])

const counter = { count: 0, running: false }

describe('an assembly with a collection', () => {
  it('routes to the collection item and to the single placement', () => {
    const model: Model = { main: counter, rows: { x: counter } }
    const row = Option.getOrThrow(
      assembly.update(model, GotRow.make('x', CounterMessage.Incremented())),
    )
    expect(row.model.rows).toEqual({ x: { count: 1, running: false } })
    const main = Option.getOrThrow(
      assembly.update(model, GotMain.make(CounterMessage.Incremented())),
    )
    expect(main.model.main.count).toBe(1)
    expect(assembly.update(model, Message.Noop())).toEqual(Option.none())
  })

  it('initialises only single placements; the collection starts as the parent left it', () => {
    const result = assembly.init({ main: counter, rows: {} })
    expect(result.model).toEqual({ main: { count: 3, running: false }, rows: {} })
  })

  it('merges both placements’ Subscriptions and only the single placement’s resources', () => {
    expect(Object.keys(assembly.subscriptions())).toEqual([
      'Counter@main/ticks',
      'Plain@rows[]/ticks',
    ])
    expect(Object.keys(assembly.resources())).toEqual(['Counter@main/socket'])
  })
})

/**
 * A Surface over a Remote read, drawn with `foldkit-surface/writes`: the read
 * names its store's field (#588), and the drawing is still never kept on it,
 * since the store moves with Remote's own Messages and with any Message that
 * starts a write. A value derived from the read is matched by the field.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity } from 'foldkit-entity'
import { pathsRead, Projection, Surface } from 'foldkit-surface'
import { Writes } from 'foldkit-surface/writes'
import { Transition } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import { expect, it } from 'vitest'
import { Remote } from '../src/index.js'

const Invoice = DomainEntity.define(
  'Invoice',
  Schema.Struct({ id: Schema.String, cents: Schema.Int }),
)
const Model = Schema.Struct({ title: Schema.String, remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Renamed: { title: Schema.String }, ...Remote.messages })
const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [Invoice] })
const row = Data.get(DomainEntity.select(Invoice, { cents: true }), 'i1')

const machine = Machine.make({
  state: Model,
  transitions: {
    Renamed: Transition.make({
      state: Model,
      input: Message.Renamed,
      apply: ({ state, input }) => [Transition.set(state.title, input.title)],
    }),
  },
})

it('draws a Surface over a Remote read again on every Message that writes', () => {
  const Row = App.surface('Row', { model: () => ({ row }) })
  const Title = App.surface('Title', { model: ({ model }) => ({ title: model.title }) })
  // The read does name the store's field.
  expect(pathsRead(Row.projection())).toEqual(Option.some([['remote']]))
  const writes = Writes.of(App, machine)
  writes.rootView(Row, undefined, (_model, h) => h.p([], []))
  writes.rootView(Title, undefined, (model, h) => h.p([], [model.title]))
  expect(writes.regions()).toEqual([
    { name: 'Row', reads: Option.none(), redrawnBy: ['Renamed'] },
    { name: 'Title', reads: Option.some([['title']]), redrawnBy: ['Renamed'] },
  ])
})

it('matches a value derived from a Remote read by the store field', () => {
  const cents = Projection.derive([row], (model: Model) => row.read(model)._tag, {
    Model: Schema.String,
  })
  const Tag = App.surface('Tag', { model: () => Projection.struct({ cents }) })
  const writes = Writes.of(App, machine)
  writes.rootView(Tag, undefined, (_model, h) => h.p([], []))
  expect(writes.regions()).toEqual([
    { name: 'Tag', reads: Option.some([['remote']]), redrawnBy: [] },
  ])
})

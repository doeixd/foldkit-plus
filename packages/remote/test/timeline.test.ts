/**
 * `timeline`: each change of each read's tag across a recorded history,
 * as Foldkit's devtools records it, with the Message that made it, `why` at
 * the Model it left, and #234's rule (#248).
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, emptyStore, writeEntities, type RemoteMessage } from '../src/index.js'
import { timeline, Why } from '../src/why.js'

const Project = Entity.define('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
const All = Query.define('All', {}, () =>
  Query.from(Project).pipe(Query.orderBy(Order.asc(Project.fields.id))),
)
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Project], queries: [All] })

const name = Entity.select(Project, { name: true })
const project = Data.get(name, 'p1')
const other = Data.get(name, 'p2')
const list = Data.query(All, {}, { select: name, first: 10 })

const loaded = [
  {
    _tag: 'ReadReceived',
    requests: ['p1', 'p2'].map(id => ({ entity: 'Project', id, fields: ['id', 'name'] })),
    result: {
      settled: [],
      entities: ['p1', 'p2'].map(id => ({ entity: 'Project', id, values: { id, name: id } })),
    },
    now: 0,
  },
  {
    _tag: 'ConnectionMerged',
    connection: list.ref.identity,
    page: {
      edges: [{ key: 'Project:p1', ref: { entity: 'Project', id: 'p1' } }],
      start: { _tag: 'Terminal' },
      end: { _tag: 'Terminal' },
    },
  },
] satisfies ReadonlyArray<RemoteMessage>
const start: Model = loaded.reduce(Data.reduce, { remote: Remote.initial })

/** Each Message with the Model it left, as `update` handled them. */
const recorded = (messages: ReadonlyArray<RemoteMessage>) =>
  messages.reduce<{
    readonly model: Model
    readonly history: ReadonlyArray<{ readonly message: RemoteMessage; readonly model: Model }>
  }>(
    ({ model, history }, message) => {
      const next = Data.reduce(model, message)
      return { model: next, history: [...history, { message, model: next }] }
    },
    { model: start, history: [] },
  ).history

const refresh: RemoteMessage = {
  _tag: 'RefreshStarted',
  requests: [{ entity: 'Project', id: 'p1', fields: ['name'] }],
}
const asked: RemoteMessage = {
  _tag: 'ReadStarted',
  requests: [{ entity: 'Project', id: 'p1', fields: ['name'] }],
}
/** A restored snapshot that holds p1 without its name. */
const dropped: RemoteMessage = {
  _tag: 'Hydrated',
  entities: writeEntities(emptyStore, [{ key: 'Project:p1', values: { id: 'p1' } }]),
  merge: 'replace',
}

describe('timeline', () => {
  const history = recorded([refresh, asked, dropped])
  const steps = timeline(Data, start, history, { project, other, list })
  // `other` never changes: p2 keeps its name through all three.

  it('has one step per change of a read’s tag, with the Message that made it', () => {
    expect(
      steps.map(({ read, index, message, from, to }) => [read, index, message._tag, from, to]),
    ).toEqual([
      ['project', 0, 'RefreshStarted', 'Ready', 'Refreshing'],
      ['list', 0, 'RefreshStarted', 'Ready', 'Refreshing'],
      ['project', 2, 'Hydrated', 'Refreshing', 'Loading'],
      ['list', 2, 'Hydrated', 'Refreshing', 'Loading'],
    ])
  })

  it('says why at the Model each changed to', () => {
    expect(steps[0]!.why.because).toEqual([
      Why.Fields({
        row: { entity: 'Project', id: 'p1' },
        via: [],
        fields: ['name'],
        held: 'Stale',
        inFlight: false,
      }),
    ])
    // The replace dropped the row, and the read begun before it is still out.
    expect(steps[2]!.why.because).toEqual([
      Why.Fields({
        row: { entity: 'Project', id: 'p1' },
        via: [],
        fields: ['name'],
        held: 'Missing',
        inFlight: true,
      }),
    ])
  })

  it('marks a read that stopped showing its value with no reason a reader can see', () => {
    expect(steps.map(step => step.regression)).toEqual([false, false, true, true])
  })

  it('passes the active record on to why', () => {
    const shown = {
      list: Surface.at(App.surface('Listing', { model: () => ({ list }) }), undefined),
    }
    const [, , , last] = timeline(
      Data,
      start,
      history,
      { project, other, list },
      {
        surfaces: shown,
      },
    )
    expect(last!.why.surfaces).toEqual(Option.some(['Listing']))
  })

  it('does not mark a read that had nothing to show', () => {
    const [loading] = timeline(
      Data,
      { remote: Remote.initial },
      [{ message: asked, model: Data.reduce({ remote: Remote.initial }, asked) }],
      { project },
    )

    expect([loading!.from, loading!.to, loading!.regression]).toEqual(['Initial', 'Loading', false])
  })

  it('is empty for a history that changes no tag', () => {
    expect(timeline(Data, start, recorded([asked]), { other, list })).toEqual([])
  })
})

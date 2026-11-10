/**
 * #481: a Remote read keeps its state through a Surface and two `map`s in a
 * `pipe`, across the life of a read: first load, refresh, a failed refetch
 * over a held value, a failure with nothing held, an absent row, and an
 * interrupted read.
 */
import { pipe, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  fieldMark,
  Freshness,
  Remote,
  RemoteData,
  requirementsOf,
  type RemoteMessage,
} from '../src/index.js'

const Project = Entity.make('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Model = Schema.Struct({ filter: Schema.String, remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages })
const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [Project] })

const project = Data.get(Project.select({ name: true }), 'p1')
const Card = App.surface('Card', { model: () => ({ project, filter: App.model.filter }) })

const requests = [{ entity: 'Project', id: 'p1', fields: ['name'] }]
const started: RemoteMessage = { _tag: 'ReadStarted', requests, by: 'card' }
const answered = (name: string): RemoteMessage => ({
  _tag: 'ReadReceived',
  requests,
  result: { settled: [], entities: [{ entity: 'Project', id: 'p1', values: { id: 'p1', name } }] },
  now: 0,
})
const absent: RemoteMessage = {
  _tag: 'ReadReceived',
  requests,
  result: { settled: [], entities: [] },
  now: 0,
}
const failed: RemoteMessage = {
  _tag: 'ReadFailed',
  requests,
  error: { _tag: 'RemoteReadError', message: 'down' },
}

const initial: Model = { filter: 'all', remote: Remote.initial }
const after = (model: Model, ...messages: ReadonlyArray<RemoteMessage>): Model =>
  messages.reduce(Data.reduce, model)
const loaded = after(initial, started, answered('Atlas'))

// The read, then two transformations of its value, then a view's fold.
const piped = (model: Model) =>
  pipe(
    Card.projection(undefined).read(model).project,
    card => RemoteData.map(card, ({ name }) => name),
    name => RemoteData.map(name, text => text.toUpperCase()),
  )

const drawn = (model: Model): string =>
  RemoteData.render(piped(model), {
    loading: () => 'skeleton',
    notFound: () => 'no such project',
    failed: error => `error: ${error.message}`,
    data: (name, freshness) =>
      Freshness.match(freshness, {
        Fresh: () => name,
        Refreshing: () => `${name} (refreshing)`,
        Stale: ({ error }) => `${name} (stale: ${error.message})`,
      }),
  })

describe('A Remote read piped through two maps', () => {
  it.each<{ readonly state: string; readonly model: Model; readonly piped: RemoteData<string> }>([
    { state: 'never asked', model: initial, piped: { _tag: 'Initial' } },
    { state: 'first load', model: after(initial, started), piped: { _tag: 'Loading' } },
    { state: 'answered', model: loaded, piped: { _tag: 'Ready', value: 'ATLAS' } },
    {
      state: 'refreshing',
      model: Data.refresh(loaded, project),
      piped: { _tag: 'Refreshing', value: 'ATLAS' },
    },
    {
      state: 'a refetch failed over the held value',
      model: after(Data.refresh(loaded, project), failed),
      piped: {
        _tag: 'Failed',
        error: { _tag: 'RemoteReadError', message: 'down' },
        previous: 'ATLAS',
      },
    },
    {
      state: 'the first read failed',
      model: after(initial, started, failed),
      piped: { _tag: 'Failed', error: { _tag: 'RemoteReadError', message: 'down' } },
    },
    {
      state: 'the row is absent',
      model: after(initial, started, absent),
      piped: { _tag: 'NotFound' },
    },
    {
      state: 'the read was interrupted',
      model: after(initial, started, {
        _tag: 'ReadAbandoned',
        by: 'card',
        marks: [fieldMark('Project', 'p1', 'name')],
      }),
      piped: { _tag: 'Initial' },
    },
  ])('keeps the state when $state', ({ model, piped: expected }) => {
    expect(piped(model)).toEqual(expected)
  })

  it.each([
    { state: 'first load', model: after(initial, started), drawn: 'skeleton' },
    { state: 'refreshing', model: Data.refresh(loaded, project), drawn: 'ATLAS (refreshing)' },
    {
      state: 'a failed refetch',
      model: after(Data.refresh(loaded, project), failed),
      drawn: 'ATLAS (stale: down)',
    },
    { state: 'a failed first read', model: after(initial, started, failed), drawn: 'error: down' },
    { state: 'an absent row', model: after(initial, started, absent), drawn: 'no such project' },
  ])('draws $state as $drawn after the pipe', ({ model, drawn: expected }) => {
    expect(drawn(model)).toBe(expected)
  })

  it('carries the read’s requirement through the Surface, so it is still fetched', () => {
    expect(requirementsOf(Card.projection(undefined))).toEqual(requirementsOf(project))
    expect(Data.plan(initial, Card.projection(undefined))).toEqual(requests)
  })
})

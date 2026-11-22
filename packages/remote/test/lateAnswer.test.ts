/**
 * A late answer in a domain with writes and no live read: a read answered
 * while a write is pending may bring a value stored after the write, and the
 * write's answer, arriving later, names an older one. The answer is written,
 * as ever, and the field is read again, as it is in a domain that reads live
 * (`temporal.test.ts`, #480): nothing else would ever bring the newer value.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Entity, Mutation, Query, Remote, type RemoteMessage } from '../src/index.js'

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Rename = Mutation.make('Rename', {
  Input: { id: Schema.String, name: Schema.String },
  Output: { id: Schema.String },
})
const All = Query.make('All', { Input: {}, Result: User })
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
// No live read anywhere: the domain has the write capability and not the live one.
const Data = Remote.make({
  model: App.model.remote,
  entities: [User],
  queries: [All],
  mutations: [Rename],
})

const selection = User.select({ name: true })
const user = Data.get(selection, 'u1')
const asked = { entity: 'User', id: 'u1', fields: ['name'] }
const read = (name: string, now = 3): RemoteMessage => ({
  _tag: 'ReadReceived',
  requests: [asked],
  result: { entities: [{ entity: 'User', id: 'u1', values: { name } }], settled: [] },
  now,
})
const rename = (model: Model, requestId: string, name: string): Model =>
  Data.mutate(
    model,
    Rename,
    { id: 'u1', name },
    { requestId, optimistic: [User.patch('u1', { name })] },
  ).model
const answer: RemoteMessage = {
  _tag: 'MutationSucceeded',
  requestId: 'a',
  entities: [{ entity: 'User', id: 'u1', values: { name: 'Grace' } }],
  now: 5,
}

const known = Data.reduce({ remote: Remote.initial }, read('Ada', 0))
// Our Grace is stored and its answer held; another writer's Eve lands after it.
const written = rename(known, 'a', 'Grace')

describe('a read answered while a write is pending, in a domain that reads nothing live', () => {
  it('reads the field again when the late answer is not what the read brought, and ends on the read', () => {
    const model = [read('Eve'), answer].reduce(Data.reduce, written)
    expect(user.read(model)).toEqual({ _tag: 'Refreshing', value: { name: 'Grace' } })
    expect(Data.plan(model, user)).toEqual([asked])
    expect(user.read(Data.reduce(model, read('Eve', 20)))).toEqual({
      _tag: 'Ready',
      value: { name: 'Eve' },
    })
  })

  it.each([
    ['a read that brought another value', true, written, [read('Eve')]],
    ['a read that brought the write', false, written, [read('Grace')]],
    ['a read of what was held', false, written, [read('Ada')]],
    [
      'a read answered before the write began',
      false,
      rename(Data.reduce(known, read('Eve')), 'a', 'Grace'),
      [],
    ],
  ])('plans a read after the answer for %s: %s', (_name, planned, from, during) => {
    const model = [...during, answer].reduce(Data.reduce, from)
    expect(Data.plan(model, user)).toEqual(planned ? [asked] : [])
  })

  it('reads a listed row again when the page that brought another value came while the write was pending', () => {
    const list = Data.query(All, {}, { select: selection, first: 10 })
    const page = (name: string): RemoteMessage => ({
      _tag: 'ConnectionMerged',
      connection: list.ref.identity,
      page: {
        edges: [{ key: 'User:u1', ref: { entity: 'User', id: 'u1' } }],
        start: { _tag: 'Terminal' },
        end: { _tag: 'Terminal' },
      },
      select: { entity: 'User', fields: ['name'] },
      entities: [{ entity: 'User', id: 'u1', values: { name } }],
      now: 3,
    })
    const pending = rename(Data.reduce({ remote: Remote.initial }, page('Ada')), 'a', 'Grace')
    const settled = [page('Eve'), answer].reduce(Data.reduce, pending)
    expect(user.read(settled)).toEqual({ _tag: 'Refreshing', value: { name: 'Grace' } })
    expect(Data.plan(settled, user)).toEqual([asked])
    expect(Data.plan([page('Grace'), answer].reduce(Data.reduce, pending), user)).toEqual([])
  })
})

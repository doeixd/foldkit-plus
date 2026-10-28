/**
 * A repeated settlement is a no-op (#273): a transport retry, or a live event
 * describing the same change, returns the Model it was given, so Foldkit does
 * not render. A failure of a request no longer pending changes nothing.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mutation, Remote, emptyStore, writeEntities, type RemoteMessage } from '../src/index.js'

const Post = DomainEntity.define('Post', Schema.Struct({ id: Schema.String, body: Schema.String }))
const EditPost = Mutation.make('EditPost', {
  Input: { id: Schema.String, body: Schema.String },
  Output: {},
})

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Post], mutations: [EditPost] })

const loaded: Model = {
  remote: {
    ...Remote.initial,
    entities: writeEntities(emptyStore, [{ key: 'Post:p1', values: { id: 'p1', body: 'first' } }]),
  },
}
const started = Data.mutate(
  loaded,
  EditPost,
  { id: 'p1', body: 'edited' },
  { requestId: 'edit', optimistic: [Remote.patch(Post, 'p1', { body: 'edited' })] },
).model

const succeeded: RemoteMessage = {
  _tag: 'MutationSucceeded',
  requestId: 'edit',
  entities: [{ entity: 'Post', id: 'p1', values: { body: 'edited' } }],
  now: 1,
}
// A new error object each time, as a decoded Message is.
const failed = (): RemoteMessage => ({
  _tag: 'MutationFailed',
  requestId: 'edit',
  error: { _tag: 'RemoteMutationError', message: 'offline' },
  operation: 'op-edit',
})

describe('A repeated settlement', () => {
  it('of a success returns the Model it was given', () => {
    const once = Data.reduce(started, succeeded)
    expect(Data.reduce(once, succeeded)).toBe(once)
  })

  it('of a failure returns the Model it was given', () => {
    const once = Data.reduce(started, failed())
    expect(Data.reduce(once, failed())).toBe(once)
  })
})

describe('A failure of a request no longer pending', () => {
  it('does not bring back a failure the application dismissed', () => {
    const dismissed = Data.dismiss(Data.reduce(started, failed()), 'edit')
    const again = Data.reduce(dismissed, failed())
    expect(Data.mutation(again, 'edit')._tag).toBe('Unknown')
    expect(again).toBe(dismissed)
  })

  it('does not mark a request applied before it failed', () => {
    const applied = Data.reduce(started, succeeded)
    expect(Data.reduce(applied, failed())).toBe(applied)
  })
})

/**
 * A field only a pending request's layer holds is still the server's to send
 * (#273). The read shows the layer's value while the request is pending, but
 * the plan asks for the field, so when the layer goes (the request fails) the
 * read keeps a value rather than dropping to `Initial` with nothing fetching.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Relation } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Mutation,
  Remote,
  emptyStore,
  tombstone,
  writeEntities,
  type RemoteMessage,
} from '../src/index.js'
import { overlay } from '../src/overlay.js'

const UserBase = DomainEntity.define(
  'User',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const PostBase = DomainEntity.define(
  'Post',
  Schema.Struct({ id: Schema.String, body: Schema.String }),
)
const Blog = DomainEntity.relate(
  { User: UserBase, Post: PostBase },
  { Post: { author: Relation.one(UserBase) } },
)
const Post = Blog.Post
const EditPost = Mutation.make('EditPost', {
  Input: { id: Schema.String, body: Schema.String },
  Output: {},
})

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Blog.Post, Blog.User],
  mutations: [EditPost],
})

const post = Data.get(
  DomainEntity.select(Post, {
    id: true,
    body: true,
    author: DomainEntity.select(Blog.User, { name: true }),
  }),
  'p1',
)

/** p1 held without its body, its author held, and an edit of the body pending. */
const pending: Model = Data.mutate(
  {
    remote: {
      ...Remote.initial,
      entities: writeEntities(emptyStore, [
        { key: 'Post:p1', values: { id: 'p1', author: 'User:u1' } },
        { key: 'User:u1', values: { name: 'Ada' } },
      ]),
    },
  },
  EditPost,
  { id: 'p1', body: 'edited' },
  { requestId: 'edit', optimistic: [Remote.patch(Post, 'p1', { body: 'edited' })] },
).model

const failed: RemoteMessage = {
  _tag: 'MutationFailed',
  requestId: 'edit',
  error: { _tag: 'RemoteMutationError', message: 'offline' },
  operation: 'op-edit',
}

describe('A field only a pending layer holds', () => {
  it('shows the layer’s value while the request is pending', () => {
    expect(post.read(pending)).toMatchObject({ _tag: 'Ready', value: { body: 'edited' } })
  })

  it('is planned, and nothing the base already holds is', () => {
    expect(Data.plan(pending, post)).toEqual([{ entity: 'Post', id: 'p1', fields: ['body'] }])
  })

  it('reads Loading, not Initial, when the request fails while its read is in flight', () => {
    const reading = Data.reduce(pending, {
      _tag: 'ReadStarted',
      requests: Data.plan(pending, post),
    })
    expect(post.read(Data.reduce(reading, failed))._tag).toBe('Loading')
  })

  it('keeps the server’s value once read, when the request fails', () => {
    const read = Data.reduce(pending, {
      _tag: 'ReadReceived',
      requests: Data.plan(pending, post),
      result: {
        settled: [],
        entities: [{ entity: 'Post', id: 'p1', values: { body: 'first' } }],
      },
      now: 1,
    })
    expect(post.read(read)).toMatchObject({ _tag: 'Ready', value: { body: 'edited' } })
    expect(post.read(Data.reduce(read, failed))).toMatchObject({
      _tag: 'Ready',
      value: { body: 'first' },
    })
  })

  it('is not planned on a row a pending request deletes', () => {
    const deleting = overlay(Data, pending, 'gone', [Remote.tombstone(Post, 'p1')])
    expect(post.read(deleting)._tag).toBe('NotFound')
    expect(Data.plan(deleting, post)).toEqual([])
  })

  describe('on a row only a pending request holds', () => {
    const fresh = Data.get(
      DomainEntity.select(Post, {
        id: true,
        body: true,
        author: DomainEntity.select(Blog.User, { name: true }),
      }),
      'p2',
    )
    /** p2 made by a pending request, over `entities`: its body is not predicted. */
    const creating = (entities: Model['remote']['entities']): Model =>
      Data.mutate(
        { remote: { ...Remote.initial, entities } },
        EditPost,
        { id: 'p2', body: '' },
        {
          requestId: 'create',
          optimistic: [Remote.patch(Post, 'p2', { id: 'p2', author: Remote.ref(Blog.User, 'u3') })],
        },
      ).model
    const answered = (model: Model): Model =>
      Data.reduce(model, {
        _tag: 'MutationSucceeded',
        requestId: 'create',
        entities: [{ entity: 'Post', id: 'p2', values: { id: 'p2', author: 'User:u3' } }],
        connections: [],
        deleted: [],
        now: 2,
      })

    // The server has nothing of p2 until the request lands. Were it asked, the
    // plan would read the same before and after the answer, and the read
    // entry, which restarts only when the plan changes, would never ask again.
    it.each([
      ['never read', emptyStore],
      ['read as absent', tombstone(emptyStore, 'Post:p2')],
    ])('asks nothing of it until it is answered, when it was %s', (_, entities) => {
      const model = creating(entities)
      expect(Data.plan(model, fresh)).toEqual([{ entity: 'User', id: 'u3', fields: ['name'] }])
      expect(Data.plan(answered(model), fresh)).toEqual([
        { entity: 'Post', id: 'p2', fields: ['body'] },
        { entity: 'User', id: 'u3', fields: ['name'] },
      ])
    })
  })

  it('follows a relation the layer points elsewhere', () => {
    const moved = Data.mutate(
      pending,
      EditPost,
      { id: 'p1', body: 'moved' },
      {
        requestId: 'move',
        optimistic: [Remote.patch(Post, 'p1', { author: Remote.ref(Blog.User, 'u2') })],
      },
    ).model
    expect(Data.plan(moved, post)).toEqual([
      { entity: 'Post', id: 'p1', fields: ['body'] },
      { entity: 'User', id: 'u2', fields: ['name'] },
    ])
  })
})

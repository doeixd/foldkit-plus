/**
 * Mutation answers settle in the order their requests started, not the order
 * they arrive (#273). An answer's patch does not overwrite a field, or clear
 * a tombstone, that a request started after it has already settled.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Mutation,
  Query,
  Remote,
  edge,
  emptyConnection,
  emptyStore,
  merge,
  segment,
  terminal,
  writeEntities,
  type RemoteMessage,
} from '../src/index.js'

const Post = DomainEntity.define('Post', Schema.Struct({ id: Schema.String, body: Schema.String }))
const Everyone = Query.define('Everyone', {}, () =>
  Query.from(Post).pipe(Query.orderBy(Order.asc(Post.fields.id))),
)
const EditPost = Mutation.make('EditPost', {
  Input: { id: Schema.String, body: Schema.String },
  Output: {},
})
const DeletePost = Mutation.make('DeletePost', { Input: { id: Schema.String }, Output: {} })

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Post],
  queries: [Everyone],
  mutations: [EditPost, DeletePost],
})

const Body = DomainEntity.select(Post, { id: true, body: true })
const everyone = Data.query(Everyone, {}, { select: Body, first: 25 })
const post = Data.get(Body, 'p1')

const loaded: Model = {
  remote: {
    ...Remote.initial,
    entities: writeEntities(emptyStore, [
      { key: 'Post:p1', values: { id: 'p1', body: 'first' } },
      { key: 'Post:p2', values: { id: 'p2', body: 'second' } },
    ]),
    connections: {
      [everyone.ref.identity]: merge(
        emptyConnection,
        segment(
          ['p1', 'p2'].map(id => edge({ entity: 'Post', id })),
          terminal,
          terminal,
        ),
      ),
    },
  },
}

const edit = (model: Model, requestId: string, body: string): Model =>
  Data.mutate(
    model,
    EditPost,
    { id: 'p1', body },
    { requestId, optimistic: [Remote.patch(Post, 'p1', { body })] },
  ).model
const remove = (model: Model, requestId: string): Model =>
  Data.mutate(
    model,
    DeletePost,
    { id: 'p1' },
    { requestId, optimistic: [Remote.tombstone(Post, 'p1')] },
  ).model

const edited = (requestId: string, body: string): RemoteMessage => ({
  _tag: 'MutationSucceeded',
  requestId,
  entities: [{ entity: 'Post', id: 'p1', values: { body } }],
  now: 1,
})
const deleted = (requestId: string): RemoteMessage => ({
  _tag: 'MutationSucceeded',
  requestId,
  entities: [],
  deleted: [{ entity: 'Post', id: 'p1' }],
  now: 1,
})

const shown = (model: Model) => {
  const read = post.read(model)
  const list = everyone.read(model)
  return {
    post: read._tag === 'Ready' ? read.value.body : read._tag,
    list: list._tag === 'Ready' ? list.value.items.map(item => item.id) : list._tag,
  }
}

describe('Two edits of one row', () => {
  const started = edit(edit(loaded, 'a', 'A'), 'b', 'B')

  it.each([
    ['in the order they started', ['a', 'b']],
    ['the later one first', ['b', 'a']],
  ])('settle on the later edit when answered %s', (_, order) => {
    const answers = { a: edited('a', 'A'), b: edited('b', 'B') } as const
    const settled = order.map(id => answers[id as 'a' | 'b']).reduce(Data.reduce, started)
    expect(shown(settled)).toEqual({ post: 'B', list: ['p1', 'p2'] })
  })

  it('leave a field the later edit did not write to the earlier answer', () => {
    const settled = [
      edited('b', 'B'),
      {
        _tag: 'MutationSucceeded',
        requestId: 'a',
        entities: [{ entity: 'Post', id: 'p2', values: { body: 'also' } }],
        now: 1,
      } satisfies RemoteMessage,
    ].reduce(Data.reduce, started)
    expect(Data.get(Body, 'p2').read(settled)).toMatchObject({ value: { body: 'also' } })
  })
})

describe('An edit started before a delete', () => {
  const started = remove(edit(loaded, 'edit', 'edited'), 'delete')

  it.each([
    ['the delete answered first', [deleted('delete'), edited('edit', 'edited')]],
    ['the edit answered first', [edited('edit', 'edited'), deleted('delete')]],
  ])('leaves the row deleted with %s', (_, answers) => {
    expect(shown(answers.reduce(Data.reduce, started))).toEqual({ post: 'NotFound', list: ['p2'] })
  })
})

describe('An edit started after a delete', () => {
  it('settles on the edit, whichever answer arrives first', () => {
    const started = edit(remove(loaded, 'delete'), 'edit', 'back')
    const settled = [edited('edit', 'back'), deleted('delete')].reduce(Data.reduce, started)
    expect(shown(settled).post).toBe('back')
    const whole: RemoteMessage = {
      _tag: 'MutationSucceeded',
      requestId: 'edit',
      entities: [{ entity: 'Post', id: 'p1', values: { id: 'p1', body: 'back' } }],
      now: 1,
    }
    const recreated = [deleted('delete'), whole].reduce(Data.reduce, started)
    expect(shown(recreated).post).toBe('back')
  })
})

describe('What the ledger keeps to order answers', () => {
  it('is empty once nothing is pending', () => {
    const settled = [edited('b', 'B'), edited('a', 'A')].reduce(
      Data.reduce,
      edit(edit(loaded, 'a', 'A'), 'b', 'B'),
    )
    expect(settled.remote.mutations.order.size).toBe(0)
    expect(settled.remote.mutations.settled.size).toBe(0)
  })

  it('is empty once the earlier request fails', () => {
    const settled = [
      edited('b', 'B'),
      {
        _tag: 'MutationFailed',
        requestId: 'a',
        error: { _tag: 'RemoteMutationError', message: 'offline' },
        operation: 'op-a',
      } satisfies RemoteMessage,
    ].reduce(Data.reduce, edit(edit(loaded, 'a', 'A'), 'b', 'B'))
    expect(settled.remote.mutations.order.size).toBe(0)
    expect(settled.remote.mutations.settled.size).toBe(0)
  })
})

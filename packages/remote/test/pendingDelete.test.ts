/**
 * A pending delete hides its row everywhere a settled one does (#246): every
 * list, every read of it and every relation that lists it, until the request
 * settles. A failure brings it back, and the answer's `deleted` keeps it gone.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order, Relation } from 'foldkit-entity'
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
  type RemoteData,
} from '../src/index.js'

const PostBase = DomainEntity.define(
  'Post',
  Schema.Struct({ id: Schema.String, body: Schema.String, authorId: Schema.String }),
)
const ThreadBase = DomainEntity.define(
  'Thread',
  Schema.Struct({ id: Schema.String, title: Schema.String }),
)
const Forum = DomainEntity.relate(
  { Post: PostBase, Thread: ThreadBase },
  { Thread: { posts: Relation.many(PostBase) } },
)
const Post = Forum.Post

const Everyone = Query.define('Everyone', {}, () =>
  Query.from(Post).pipe(Query.orderBy(Order.asc(Post.fields.id))),
)
const ByAuthor = Query.define('ByAuthor', { authorId: Schema.String }, ({ input }) =>
  Query.from(Post).pipe(
    Query.where(Expr.eq(Post.fields.authorId, input.authorId)),
    Query.orderBy(Order.asc(Post.fields.id)),
  ),
)
const DeletePost = Mutation.make('DeletePost', { Input: { id: Schema.String }, Output: {} })
const EditPost = Mutation.make('EditPost', {
  Input: { id: Schema.String, body: Schema.String },
  Output: {},
})

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Forum.Post, Forum.Thread],
  queries: [Everyone, ByAuthor],
  mutations: [DeletePost, EditPost],
})

const Body = DomainEntity.select(Post, { id: true, body: true })
const everyone = Data.query(Everyone, {}, { select: Body, first: 25 })
const byAda = Data.query(ByAuthor, { authorId: 'ada' }, { select: Body, first: 25 })
const thread = Data.get(DomainEntity.select(Forum.Thread, { title: true, posts: Body }), 't1')
const post = Data.get(Body, 'p1')

const listOf = (ids: ReadonlyArray<string>) =>
  merge(
    emptyConnection,
    segment(
      ids.map(id => edge({ entity: 'Post', id })),
      terminal,
      terminal,
    ),
  )

/** Two lists and a thread that each hold `p1`, all read. */
const loaded: Model = {
  remote: {
    ...Remote.initial,
    entities: writeEntities(emptyStore, [
      { key: 'Post:p1', values: { id: 'p1', body: 'first', authorId: 'ada' } },
      { key: 'Post:p2', values: { id: 'p2', body: 'second', authorId: 'ada' } },
      { key: 'Thread:t1', values: { title: 'Welcome', posts: ['Post:p1', 'Post:p2'] } },
    ]),
    connections: {
      [everyone.ref.identity]: listOf(['p1', 'p2']),
      [byAda.ref.identity]: listOf(['p1', 'p2']),
    },
  },
}

const ids = <A>(
  read: RemoteData<A>,
  items: (value: A) => ReadonlyArray<{ readonly id: string }>,
) => (read._tag === 'Ready' ? items(read.value).map(item => item.id) : read._tag)

/** What each read shows: both lists, the thread's posts, and `p1` itself. */
const shown = (model: Model) => ({
  everyone: ids(everyone.read(model), page => page.items),
  byAda: ids(byAda.read(model), page => page.items),
  thread: ids(thread.read(model), value => value.posts),
  post: post.read(model)._tag,
})

const before = { everyone: ['p1', 'p2'], byAda: ['p1', 'p2'], thread: ['p1', 'p2'], post: 'Ready' }
const hidden = { everyone: ['p2'], byAda: ['p2'], thread: ['p2'], post: 'NotFound' }

const deleting = (model: Model, requestId = 'delete') =>
  Data.mutate(
    model,
    DeletePost,
    { id: 'p1' },
    { requestId, optimistic: [Remote.tombstone(Post, 'p1')] },
  ).model

describe('A pending delete', () => {
  it('starts from a fixture where every read shows the row', () => {
    expect(shown(loaded)).toEqual(before)
  })

  it('hides the row from every list, its own read and every relation', () => {
    expect(shown(deleting(loaded))).toEqual(hidden)
  })

  it('leaves the server’s store alone, so a confirmed read still shows the row', () => {
    const pending = deleting(loaded)
    expect(pending.remote.entities).toBe(loaded.remote.entities)
    expect(Data.confirmed(post).read(pending)._tag).toBe('Ready')
  })

  it('brings the row back everywhere when the delete fails', () => {
    const failed = Data.reduce(deleting(loaded), {
      _tag: 'MutationFailed',
      requestId: 'delete',
      error: { _tag: 'RemoteMutationError', message: 'offline' },
      operation: 'op',
    })
    expect(shown(failed)).toEqual(before)
  })

  it('stays gone once the answer deletes the row', () => {
    const settled = Data.reduce(deleting(loaded), {
      _tag: 'MutationSucceeded',
      requestId: 'delete',
      entities: [],
      deleted: [{ entity: 'Post', id: 'p1' }],
      now: 1,
    })
    expect(settled.remote.optimistic.layers).toEqual([])
    expect(shown(settled)).toEqual(hidden)
  })

  it('wins over a pending edit of its row, made before or after it', () => {
    const edit = (model: Model) =>
      Data.mutate(
        model,
        EditPost,
        { id: 'p1', body: 'edited' },
        { requestId: 'edit', optimistic: [Remote.patch(Post, 'p1', { body: 'edited' })] },
      ).model
    expect(shown(deleting(edit(loaded)))).toEqual(hidden)
    expect(shown(edit(deleting(loaded)))).toEqual(hidden)
  })

  it('stays gone once it settles while an edit made before it is pending (#273)', () => {
    const edited = Data.mutate(
      loaded,
      EditPost,
      { id: 'p1', body: 'edited' },
      { requestId: 'edit', optimistic: [Remote.patch(Post, 'p1', { body: 'edited' })] },
    ).model
    const settled = Data.reduce(deleting(edited), {
      _tag: 'MutationSucceeded',
      requestId: 'delete',
      entities: [],
      deleted: [{ entity: 'Post', id: 'p1' }],
      now: 1,
    })
    expect(shown(settled)).toEqual(hidden)
  })

  it('is shown by an overlay too, and lifting it brings the row back', () => {
    const previewed = Data.overlay(loaded, 'preview', [Remote.tombstone(Post, 'p1')])
    expect(shown(previewed)).toEqual(hidden)
    expect(shown(Data.lift(previewed, 'preview'))).toEqual(before)
  })

  it('keeps its row through retention, so a failure still has it to bring back', () => {
    const left = Data.reduce(deleting(loaded), {
      _tag: 'RetentionChanged',
      roots: Remote.retain([]).modelToDependencies({ remote: Remote.initial }),
    })
    const failed = Data.reduce(left, {
      _tag: 'MutationFailed',
      requestId: 'delete',
      error: { _tag: 'RemoteMutationError', message: 'offline' },
      operation: 'op',
    })
    expect(post.read(failed)._tag).toBe('Ready')
  })
})

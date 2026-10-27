/**
 * A mutation's answer carries what the client shows (#245): of each row the
 * outcome names, the shown fields the answer left out and every shown
 * relation, read after the write as any read is.
 */
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Order, Relation } from 'foldkit-entity'
import {
  ConnectionChange,
  Mutation,
  Query,
  Remote,
  type MutationRequest,
  type RelationRequirement,
} from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { RemoteServer, RemoteServerError } from '../src/index.js'

const UserBase = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const PostBase = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String, body: Schema.String }),
)
const { User, Post } = Entity.relate(
  { User: UserBase, Post: PostBase },
  { Post: { author: Relation.one(UserBase) } },
)

const Create = Mutation.make('Create', {
  Input: { id: Schema.String, title: Schema.String },
  Output: {},
})
const Touch = Mutation.make('Touch', { Input: { id: Schema.String }, Output: {} })
const Drop = Mutation.make('Drop', { Input: { id: Schema.String }, Output: {} })
const Reassign = Mutation.make('Reassign', { Input: { id: Schema.String }, Output: {} })
const Feed = 'Feed\u0000{}'

const Data = Remote.define({ entities: [User, Post], mutations: [Create, Touch, Drop, Reassign] })

/** What a feed of posts shows: the title and body, and the author's name. */
const feed: RelationRequirement = {
  entity: 'Post',
  fields: ['title', 'body', 'author'],
  relations: { author: { entity: 'User', fields: ['name'] } },
}

const backend = (options: { readonly hidden?: string } = {}) =>
  RemoteServer.memory({
    domain: Data,
    rows: {
      User: [{ id: 'u1', name: 'Ada' }],
      Post: [{ id: 'p1', title: 'One', body: 'First', author: 'User:u1' }],
    },
    principal: 'reader',
    // The reader may not read a post's body.
    authorize: { Post: (_, fields) => fields.filter(field => field !== 'body') },
    readable: () =>
      Effect.succeed((entity, row) => !(entity === 'Post' && row['id'] === options.hidden)),
    mutations: store => [
      // Answers the stored title only, as a writer of stored columns does.
      RemoteServer.mutation(Create, ({ input }) => {
        store.write('Post', input.id, { ...input, body: 'Draft', author: 'User:u1' })
        return Effect.succeed({
          output: {},
          entities: [Remote.patch(Post, input.id, { id: input.id, title: input.title })],
          connections: [RemoteServer.prepend(Feed, { entity: 'Post', id: input.id })],
        })
      }),
      // Changed the row somewhere the server cannot see, and names it with no values.
      RemoteServer.mutation(Touch, ({ input }) =>
        Effect.succeed({ output: {}, entities: [Remote.patch(Post, input.id, {})] }),
      ),
      // Archives the row: still stored, but gone from the client's view.
      RemoteServer.mutation(Drop, ({ input }) =>
        Effect.succeed({
          output: {},
          entities: [Remote.patch(Post, input.id, { title: 'Gone' })],
          deleted: [{ entity: 'Post', id: input.id }],
        }),
      ),
      // Answers the relation's ref, which does not reach what the client reads of its target.
      RemoteServer.mutation(Reassign, ({ input }) =>
        Effect.succeed({
          output: {},
          entities: [Remote.patch(Post, input.id, { title: 'One', author: 'User:u1' })],
        }),
      ),
    ],
  })

type Request = Omit<typeof MutationRequest.Type, 'requestId'>

const mutate = (request: Request, options: { readonly hidden?: string } = {}) =>
  Effect.runPromise(
    RemoteServer.handlers(backend(options).server, 'reader').FoldkitRemoteMutate({
      requestId: 'r1',
      ...request,
    }),
  )

describe('a mutation answers what the client shows', () => {
  it('reads the shown fields its answer left out, and the shown relation with its target', async () => {
    const answer = await mutate({
      mutation: 'Create',
      input: { id: 'p2', title: 'Two' },
      shown: [feed],
    })
    expect(answer.entities).toEqual([
      { entity: 'Post', id: 'p2', values: { id: 'p2', title: 'Two' } },
    ])
    expect(answer.read).toEqual({
      requests: [
        {
          entity: 'Post',
          id: 'p2',
          fields: ['body', 'author'],
          relations: { author: { entity: 'User', fields: ['name'] } },
        },
      ],
      result: {
        entities: [
          { entity: 'Post', id: 'p2', values: { author: 'User:u1' } },
          { entity: 'User', id: 'u1', values: { name: 'Ada' } },
        ],
        // Read as any read is: a field the reader may not read is settled.
        settled: [{ entity: 'Post', id: 'p2', fields: ['body'] }],
      },
    })
  })

  it('reads a shown relation the answer carried, to reach its target', async () => {
    const answer = await mutate({ mutation: 'Reassign', input: { id: 'p1' }, shown: [feed] })
    expect(answer.read?.requests).toEqual([
      {
        entity: 'Post',
        id: 'p1',
        fields: ['body', 'author'],
        relations: { author: { entity: 'User', fields: ['name'] } },
      },
    ])
    expect(answer.read?.result.entities).toContainEqual({
      entity: 'User',
      id: 'u1',
      values: { name: 'Ada' },
    })
  })

  it('answers a row named with no values wholly from the read', async () => {
    const answer = await mutate({
      mutation: 'Touch',
      input: { id: 'p1' },
      shown: [{ entity: 'Post', fields: ['title'] }],
    })
    expect(answer.read).toEqual({
      requests: [{ entity: 'Post', id: 'p1', fields: ['title'] }],
      result: { entities: [{ entity: 'Post', id: 'p1', values: { title: 'One' } }], settled: [] },
    })
  })

  it('unions the slices the client sent for one entity', async () => {
    const answer = await mutate({
      mutation: 'Touch',
      input: { id: 'p1' },
      shown: [
        { entity: 'Post', fields: ['title'] },
        { entity: 'Post', fields: ['author'] },
      ],
    })
    expect(answer.read?.requests).toEqual([
      { entity: 'Post', id: 'p1', fields: ['title', 'author'] },
    ])
  })

  it('reads nothing of a row whose answer carries every shown field', async () => {
    const answer = await mutate({
      mutation: 'Create',
      input: { id: 'p2', title: 'Two' },
      shown: [{ entity: 'Post', fields: ['title'] }],
    })
    expect(answer.read).toBeUndefined()
  })

  it('reads a row the answer only put in a list', async () => {
    const listed = await Effect.runPromise(
      RemoteServer.handlers(
        RemoteServer.make({
          entities: [
            RemoteServer.entity<string>(Post, {
              read: ({ ids }) => Effect.succeed(ids.map(id => ({ id, values: { title: id } }))),
            }),
          ],
          mutations: [
            RemoteServer.mutation(Touch, ({ input }) =>
              Effect.succeed({
                output: {},
                connections: [RemoteServer.prepend(Feed, { entity: 'Post', id: input.id })],
              }),
            ),
          ],
        }),
        'reader',
      ).FoldkitRemoteMutate({
        requestId: 'r1',
        mutation: 'Touch',
        input: { id: 'p3' },
        shown: [{ entity: 'Post', fields: ['title'] }],
      }),
    )
    expect(listed.read?.requests).toEqual([{ entity: 'Post', id: 'p3', fields: ['title'] }])
  })

  it('reads nothing of a row the mutation deleted', async () => {
    const answer = await mutate({
      mutation: 'Drop',
      input: { id: 'p1' },
      shown: [feed],
    })
    expect(answer.read).toBeUndefined()
  })

  it('reads nothing of an entity the client does not show', async () => {
    const answer = await mutate({
      mutation: 'Touch',
      input: { id: 'p1' },
      shown: [{ entity: 'User', fields: ['name'] }],
    })
    expect(answer.read).toBeUndefined()
  })

  it('reads nothing when the client says nothing', async () => {
    const answer = await mutate({ mutation: 'Touch', input: { id: 'p1' } })
    expect(answer.read).toBeUndefined()
  })

  it('leaves out a row the reader cannot see, keeping what the answer wrote', async () => {
    const answer = await mutate(
      { mutation: 'Touch', input: { id: 'p1' }, shown: [{ entity: 'Post', fields: ['title'] }] },
      { hidden: 'p1' },
    )
    expect(answer.read).toBeUndefined()
  })

  it('answers without the read when it fails, since the write has landed', async () => {
    const answer = await Effect.runPromise(
      RemoteServer.handlers(
        RemoteServer.make({
          entities: [
            RemoteServer.entity<string>(Post, {
              read: () => Effect.fail(new RemoteServerError({ message: 'The database went away' })),
            }),
          ],
          mutations: [
            RemoteServer.mutation(Touch, ({ input }) =>
              Effect.succeed({ output: {}, entities: [Remote.patch(Post, input.id, {})] }),
            ),
          ],
        }),
        'reader',
      ).FoldkitRemoteMutate({
        requestId: 'r1',
        mutation: 'Touch',
        input: { id: 'p1' },
        shown: [{ entity: 'Post', fields: ['title'] }],
      }),
    )
    expect(answer).toEqual({
      output: {},
      entities: [{ entity: 'Post', id: 'p1', values: {} }],
      connections: [],
      deleted: [],
    })
  })
})

const Posts = Query.define('Posts', {}, () =>
  Query.from(Post).pipe(Query.orderBy(Order.asc(Post.fields.id))),
)
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })

describe('a created row, end to end', () => {
  const Client = Remote.make({
    model: App.model.remote,
    entities: [User, Post],
    queries: [Posts],
    mutations: [Create],
    verifyAnswers: true,
  })
  const row = Entity.select(Post, {
    title: true,
    body: true,
    author: Entity.select(User, { name: true }),
  })
  const posts = Client.query(Posts, {}, { select: row, first: 25 })
  Client.subscriptions({ home: App.surface('Home', { model: () => ({ posts }) }) })

  const server = RemoteServer.memory({
    domain: Client,
    rows: {
      User: [{ id: 'u1', name: 'Ada' }],
      Post: [{ id: 'p1', title: 'One', body: 'First', author: 'User:u1' }],
    },
    mutations: store => [
      RemoteServer.mutation(Create, ({ input }) => {
        store.write('Post', input.id, { ...input, body: 'Draft', author: 'User:u1' })
        return Effect.succeed({
          output: {},
          entities: [Remote.patch(Post, input.id, { id: input.id, title: input.title })],
          connections: [RemoteServer.prepend(posts.ref.identity, { entity: 'Post', id: input.id })],
        })
      }),
    ],
  })

  it('lands Ready with every field the list shows, and leaves no gap', async () => {
    const loaded: Model = await Effect.runPromise(
      Client.prefetch({ remote: Remote.initial }, posts).pipe(Effect.provide(server.layer)),
    )
    const p2 = { entity: 'Post', id: 'p2' }
    const started = Client.mutate(
      loaded,
      Create,
      { id: 'p2', title: 'Two' },
      {
        optimistic: [
          Remote.patch(Post, 'p2', { id: 'p2', title: 'Two', body: '', author: 'User:u1' }),
          ConnectionChange.prepend(posts.ref, p2),
        ],
      },
    )
    const message = await Effect.runPromise(
      started.command.effect.pipe(Effect.provide(server.layer)),
    )
    const settled = Client.reduce(started.model, message)

    expect(Client.get(row, 'p2').read(settled)).toEqual({
      _tag: 'Ready',
      value: { title: 'Two', body: 'Draft', author: { name: 'Ada' } },
    })
    expect(settled.remote.answerGaps).toEqual([])
  })
})

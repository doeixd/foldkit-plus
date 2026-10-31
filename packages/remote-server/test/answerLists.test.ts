/**
 * A mutation's answer carries the first page of each list the client asks
 * back (#386): read after the write, as `FoldkitRemoteQuery` reads it, within
 * the bounds a read keeps. A list past them is left out, and the write runs.
 */
import { Effect, Schema } from 'effect'
import { Entity, Order } from 'foldkit-entity'
import {
  Diagnostics,
  MAX_ANSWER_LISTS,
  Mutation,
  MutationRequest,
  Query,
  Remote,
  type QueryRequest,
} from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { RemoteServer, RemoteServerError, type HandlerOptions } from '../src/index.js'

const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Note = Entity.define('Note', Schema.Struct({ id: Schema.String }))

const Posts = Query.define('Posts', {}, () =>
  Query.from(Post).pipe(Query.orderBy(Order.asc(Post.fields.id))),
)
const Create = Mutation.make('Create', {
  Input: { id: Schema.String, title: Schema.String },
  Output: {},
})
const Data = Remote.define({ entities: [Post, Note], queries: [Posts], mutations: [Create] })

/** The reader may not see p2, so a page lists the rows a read of it would. */
const backend = () =>
  RemoteServer.memory({
    domain: Data,
    rows: {
      Post: [
        { id: 'p1', title: 'One' },
        { id: 'p2', title: 'Hidden' },
        { id: 'p3', title: 'Three' },
      ],
    },
    principal: 'reader',
    readable: () => Effect.succeed((entity, row) => !(entity === 'Post' && row['id'] === 'p2')),
    mutations: store => [
      RemoteServer.mutation(Create, ({ input }) => {
        store.write('Post', input.id, input)
        return Effect.succeed({
          output: {},
          entities: [Remote.patch(Post, input.id, input)],
        })
      }),
    ],
  })

type ListRequest = typeof QueryRequest.Type

const firstPage = (first: number): ListRequest => ({
  query: 'Posts',
  input: {},
  window: { first },
  select: { entity: 'Post', fields: ['title'] },
})

const handlersOf = (options: HandlerOptions<string, never> = {}) =>
  RemoteServer.handlers(backend().server, 'reader', options)

/** The write's answer, and what the server reported while answering it. */
const create = async (
  lists: ReadonlyArray<ListRequest>,
  options: HandlerOptions<string, never> = {},
) => {
  const collected = Diagnostics.collect()
  const answer = await Effect.runPromise(
    handlersOf(options)
      .FoldkitRemoteMutate({
        requestId: 'r1',
        mutation: 'Create',
        input: { id: 'p0', title: 'Zero' },
        lists,
      })
      .pipe(Effect.provideService(Diagnostics.Reporter, collected.report)),
  )
  return { answer, reported: collected.reported }
}

describe('the lists a mutation answers', () => {
  it('carries each first page as a query of it after the write returns', async () => {
    const handlers = handlersOf()
    const answer = await Effect.runPromise(
      handlers.FoldkitRemoteMutate({
        requestId: 'r1',
        mutation: 'Create',
        input: { id: 'p0', title: 'Zero' },
        lists: [firstPage(2)],
      }),
    )
    const refetched = await Effect.runPromise(handlers.FoldkitRemoteQuery(firstPage(2)))
    expect(answer.lists).toEqual([{ request: firstPage(2), result: refetched }])
    // Read after the write, and as the reader may: the new row in, the hidden one out.
    expect(refetched.edges.map(edge => edge.id)).toEqual(['p0', 'p1'])
  })

  it('leaves out a page past maxIdsPerEntity, counting every list of one entity', async () => {
    const { answer } = await create([firstPage(2), firstPage(2)], { maxIdsPerEntity: 3 })
    expect(answer.lists?.map(list => list.request)).toEqual([firstPage(2)])
  })

  it.each<readonly [string, ListRequest]>([
    ['a page after a cursor', { ...firstPage(2), window: { first: 2, after: 'p1' } }],
    ['a page with no size', { ...firstPage(2), window: {} }],
    ['a page with no select', { query: 'Posts', input: {}, window: { first: 2 } }],
    [
      'a page selecting another entity',
      { ...firstPage(2), select: { entity: 'Note', fields: [] } },
    ],
    ['an unknown query', { ...firstPage(2), query: 'Nope' }],
    [
      'a select paging one relation more ways than a read may',
      {
        ...firstPage(2),
        select: { entity: 'Post', fields: ['a@1', 'a@2', 'a@3', 'a@4', 'a@5'] },
      },
    ],
  ])('leaves out %s before reading it, and still writes', async (_, list) => {
    const { answer, reported } = await create([list])
    expect(answer.lists).toBeUndefined()
    // Refused as it was asked, so no read of it failed.
    expect(reported).toEqual([])
    expect(answer.entities).toEqual([
      { entity: 'Post', id: 'p0', values: { id: 'p0', title: 'Zero' } },
    ])
  })

  it('leaves out a page whose read fails, and says so', async () => {
    const collected = Diagnostics.collect()
    const server = RemoteServer.make({
      entities: [RemoteServer.entity<string>(Post, { read: () => Effect.succeed([]) })],
      queries: [
        RemoteServer.query(Posts, () =>
          Effect.fail(new RemoteServerError({ message: 'The database went away' })),
        ),
      ],
      mutations: [
        RemoteServer.mutation(Create, () => Effect.succeed({ output: {}, entities: [] })),
      ],
    })
    const answer = await Effect.runPromise(
      RemoteServer.handlers(server, 'reader')
        .FoldkitRemoteMutate({
          requestId: 'r1',
          mutation: 'Create',
          input: { id: 'p0', title: 'Zero' },
          lists: [firstPage(2)],
        })
        .pipe(Effect.provideService(Diagnostics.Reporter, collected.report)),
    )
    expect(answer.lists).toBeUndefined()
    expect(collected.reported).toMatchObject([
      { _tag: 'AnswerUnread', reason: 'list "Posts": The database went away' },
    ])
  })

  it('refuses more lists than MAX_ANSWER_LISTS where the request is decoded', () => {
    const request = {
      requestId: 'r1',
      mutation: 'Create',
      input: {},
      lists: Array.from({ length: MAX_ANSWER_LISTS + 1 }, () => firstPage(1)),
    }
    expect(() => Schema.decodeUnknownSync(MutationRequest)(request)).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(MutationRequest)({
        ...request,
        lists: request.lists.slice(1),
      }),
    ).not.toThrow()
  })
})

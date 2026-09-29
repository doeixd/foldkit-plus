/**
 * The query handler answers the client's selection with the page, so one
 * response carries edges and fields.
 */
import { Effect, Schema } from 'effect'
import { Entity, Query } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { RemoteServer } from '../src/index.js'

const Post = Entity.make(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String, excerpt: Schema.String }),
)
const PostsQuery = Query.make('Posts', {
  Input: {},
  Result: Query.connection(Post),
})

describe('query payload', () => {
  it('returns selected fields with the page, settled when withheld', async () => {
    const server = RemoteServer.make({
      entities: [
        RemoteServer.entity(Post, {
          read: ({ ids }) =>
            Effect.succeed(
              ids.flatMap(id =>
                id === 'p1' ? [{ id, values: { id, title: 'T', excerpt: 'E' } }] : [],
              ),
            ),
          authorize: (_principal, fields) => fields.filter(field => field !== 'excerpt'),
        }),
      ],
      queries: [
        RemoteServer.query(PostsQuery, () =>
          Effect.succeed({
            edges: [{ entity: 'Post', id: 'p1', key: 'Post:p1' }],
            start: { _tag: 'Terminal' as const },
            end: { _tag: 'Terminal' as const },
          }),
        ),
      ],
    })
    const handlers = RemoteServer.handlers(server, undefined)
    const page = await Effect.runPromise(
      handlers.FoldkitRemoteQuery({
        query: 'Posts',
        input: {},
        window: {},
        select: { entity: 'Post', fields: ['id', 'title', 'excerpt'] },
      }),
    )
    expect(page.edges).toHaveLength(1)
    expect(page.entities).toMatchObject([{ id: 'p1', values: { id: 'p1', title: 'T' } }])
    // Withheld by authorize, so the client stops asking for it.
    expect(page.settled).toMatchObject([{ entity: 'Post', id: 'p1', fields: ['excerpt'] }])
  })

  it('edges alone when no selection is sent', async () => {
    const server = RemoteServer.make({
      entities: [
        RemoteServer.entity(Post, {
          read: () => Effect.succeed([]),
        }),
      ],
      queries: [
        RemoteServer.query(PostsQuery, () =>
          Effect.succeed({
            edges: [{ entity: 'Post', id: 'p1', key: 'Post:p1' }],
            start: { _tag: 'Terminal' as const },
            end: { _tag: 'Terminal' as const },
          }),
        ),
      ],
    })
    const handlers = RemoteServer.handlers(server, undefined)
    const page = await Effect.runPromise(
      handlers.FoldkitRemoteQuery({ query: 'Posts', input: {}, window: {} }),
    )
    expect(page.edges).toHaveLength(1)
    expect(page.entities ?? []).toEqual([])
    expect(page.settled ?? []).toEqual([])
  })
})

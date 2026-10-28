/**
 * A chirp posted, as the compose box sends it (`Data.mutate` of `PostChirp`):
 * the Entity stamps who wrote it and when, so before the server answers the
 * page shows it written by you, at the top of the newest-first timeline, and
 * counts it in your post count.
 */
import { Entity } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Data, initial, type Model } from '../src/app.js'
import { Chirper } from '../src/domain.js'
import { Post } from '../src/guard.js'
import { PostChirp, Timeline } from '../src/operations.js'

/** What this test reads of a post: none of what only the server can say (`may`). */
const Line = Entity.select(Post, { body: true, authorId: true, createdAt: true, likeCount: true })
const Card = Entity.select(Chirper, { postCount: true })
const timeline = Data.query(Timeline, {}, { select: Line, first: 25 })

/** As you read the page at 5000: two chirps, the newest first, and your own count. */
const held: Model = [
  {
    _tag: 'ConnectionMerged' as const,
    connection: timeline.ref.identity,
    page: {
      edges: ['p1', 'p2'].map(id => ({ key: `Post:${id}`, ref: { entity: 'Post', id } })),
      start: { _tag: 'Terminal' },
      end: { _tag: 'Terminal' },
    },
  },
  {
    _tag: 'ReadReceived' as const,
    requests: [
      { entity: 'Post', id: 'p1', fields: ['id', 'body', 'authorId', 'createdAt', 'likeCount'] },
      { entity: 'Post', id: 'p2', fields: ['id', 'body', 'authorId', 'createdAt', 'likeCount'] },
      { entity: 'User', id: 'you', fields: ['postCount'] },
    ],
    result: {
      settled: [],
      entities: [
        {
          entity: 'Post',
          id: 'p1',
          values: { id: 'p1', body: 'Newer', authorId: 'ada', createdAt: 4_000, likeCount: 0 },
        },
        {
          entity: 'Post',
          id: 'p2',
          values: { id: 'p2', body: 'Older', authorId: 'ada', createdAt: 3_000, likeCount: 0 },
        },
        { entity: 'User', id: 'you', values: { id: 'you', postCount: 1 } },
      ],
    },
    now: 5_000,
  },
].reduce((model: Model, message) => Data.reduce(model, message), initial)

const posted = (model: Model): Model =>
  Data.mutate(model, PostChirp, { id: 'n1', body: 'Hello' }).model

describe('a chirp posted', () => {
  it('shows at once as yours, at the time the page last heard, with no likes yet', () => {
    expect(Data.get(Line, 'n1').read(posted(held))).toMatchObject({
      _tag: 'Ready',
      value: { body: 'Hello', authorId: 'you', createdAt: 5_000, likeCount: 0 },
    })
  })

  it('goes to the top of the newest-first timeline', () => {
    const read = timeline.read(posted(held))
    expect(read._tag === 'Ready' ? read.value.items.map(post => post.body) : read._tag).toEqual([
      'Hello',
      'Newer',
      'Older',
    ])
  })

  it('counts in your post count', () => {
    expect(Data.get(Card, 'you').read(posted(held))).toMatchObject({ value: { postCount: 2 } })
  })
})

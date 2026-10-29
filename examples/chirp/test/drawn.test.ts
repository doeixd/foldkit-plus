/**
 * A chirp posted is drawn in the page's timeline before the server answers:
 * every member the timeline selects is shown, `may` too, which the page reads
 * from the rules it shares with the server (`isAuthor`: the post's author is
 * whoever asks), so its Edit button is there at once. operations-phase5-DESIGN.
 */
import { Option } from 'effect'
import { May } from 'foldkit-guard'
import { describe, expect, it } from 'vitest'
import { Data, Message, initial, update, type Model } from '../src/app.js'
import { Timeline, TimelinePost } from '../src/operations.js'

const timeline = Data.query(Timeline, {}, { select: TimelinePost, first: 25 })

/** The server's `may` for a post the reader did not write: nothing but liking it. */
const theirs = {
  row: { Update: false, Delete: false },
  reasons: {},
  members: {},
  relations: {},
}

const fields = ['id', 'body', 'likeCount', 'createdAt', 'may', 'liked', 'author']

/** As you read the page: Ada's chirp, and you and Ada as the server sent you. */
const held: Model = [
  {
    _tag: 'ConnectionMerged' as const,
    connection: timeline.ref.identity,
    page: {
      edges: [{ key: 'Post:p1', ref: { entity: 'Post', id: 'p1' } }],
      start: { _tag: 'Terminal' },
      end: { _tag: 'Terminal' },
    },
  },
  {
    _tag: 'ReadReceived' as const,
    requests: [
      { entity: 'Post', id: 'p1', fields },
      { entity: 'User', id: 'ada', fields: ['name', 'handle'] },
      { entity: 'User', id: 'you', fields: ['name', 'handle'] },
    ],
    result: {
      settled: [],
      entities: [
        {
          entity: 'Post',
          id: 'p1',
          values: {
            id: 'p1',
            body: 'Hers',
            likeCount: 0,
            createdAt: 4_000,
            may: theirs,
            liked: null,
            author: 'User:ada',
          },
        },
        { entity: 'User', id: 'ada', values: { id: 'ada', name: 'Ada', handle: 'ada' } },
        { entity: 'User', id: 'you', values: { id: 'you', name: 'You', handle: 'you' } },
      ],
    },
    now: 5_000,
  },
].reduce((model: Model, message) => Data.reduce(model, message), initial)

const posted = update(
  held,
  Message.ClockedPost({ post: { id: 'n1', body: 'Hello' }, now: 6_000 }),
).model

describe('a chirp posted, as the timeline draws it', () => {
  it('is drawn at the top before the answer, by you, with no likes', () => {
    const read = timeline.read(posted)
    expect(read._tag).toBe('Ready')
    if (read._tag !== 'Ready') return
    const [first] = read.value.items
    expect(read.value.items.map(post => post.body)).toEqual(['Hello', 'Hers'])
    expect(first).toMatchObject({
      body: 'Hello',
      createdAt: 6_000,
      likeCount: 0,
      liked: Option.none(),
      author: { name: 'You', handle: 'you' },
    })
  })

  it('is yours to edit and delete, as the server will say', () => {
    const read = timeline.read(posted)
    if (read._tag !== 'Ready') throw new Error(`the timeline is ${read._tag}`)
    const [mine, hers] = read.value.items
    expect(May.can(mine!.may, 'Update')).toBe(true)
    expect(May.can(mine!.may, 'Delete')).toBe(true)
    expect(May.can(hers!.may, 'Update')).toBe(false)
  })
})

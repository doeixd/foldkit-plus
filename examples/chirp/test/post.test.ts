/**
 * A chirp posted, as the compose box sends it: the clock is read when you
 * post (`Remote.now`), and `Data.mutate` of `PostChirp` is given that time.
 * The Entity stamps who wrote it and when, so before the server answers the
 * page shows it written by you, at the time you posted, at the top of the
 * newest-first timeline, and counted in your post count. The server keeps
 * that time, so the answer moves nothing.
 */
import { Effect, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { Entity } from 'foldkit-entity'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { outboxStatus } from 'foldkit-remote/outbox'
import { Respond, Trace } from 'foldkit-remote/testing'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { ComposeForm, Data, Message, durable, update, type Model } from '../src/app.js'
import { opened } from './opened.js'
import { Compose } from '../src/compose.js'
import { Chirper } from '../src/domain.js'
import { Post } from '../src/guard.js'
import { PostChirp, Timeline } from '../src/operations.js'
import { openServer, principalOf } from '../src/server/server.js'
import { memorySqlite } from '../src/server/sqlite-node.js'

/** What this test reads of a post: none of what only the server can say (`may`). */
const Line = Entity.select(Post, { body: true, author: true, createdAt: true, likeCount: true })
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
      { entity: 'Post', id: 'p1', fields: ['id', 'body', 'author', 'createdAt', 'likeCount'] },
      { entity: 'Post', id: 'p2', fields: ['id', 'body', 'author', 'createdAt', 'likeCount'] },
      { entity: 'User', id: 'you', fields: ['postCount'] },
    ],
    result: {
      settled: [],
      entities: [
        {
          entity: 'Post',
          id: 'p1',
          values: { id: 'p1', body: 'Newer', author: 'User:ada', createdAt: 4_000, likeCount: 0 },
        },
        {
          entity: 'Post',
          id: 'p2',
          values: { id: 'p2', body: 'Older', author: 'User:ada', createdAt: 3_000, likeCount: 0 },
        },
        { entity: 'User', id: 'you', values: { id: 'you', postCount: 1 } },
      ],
    },
    now: 5_000,
  },
].reduce((model: Model, message) => Data.reduce(model, message), opened)

/** The chirp as it arrives once the clock is read: you posted at 6000. */
const posted = (model: Model): Model =>
  update(model, Message.ClockedPost({ post: { id: 'n1', body: 'Hello' }, now: 6_000 })).model

describe('a chirp posted', () => {
  it('shows at once as yours, at the time you posted, with no likes yet', () => {
    expect(Data.get(Line, 'n1').read(posted(held))).toMatchObject({
      _tag: 'Ready',
      value: {
        body: 'Hello',
        author: { entity: 'User', id: 'you' },
        createdAt: 6_000,
        likeCount: 0,
      },
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

  it('waits in the outbox, so a reload before the answer keeps it', () => {
    expect(outboxStatus(Data, posted(held))).toMatchObject({ waiting: 1, failed: 0 })
  })
})

describe('a chirp of yours deleted before the answer', () => {
  const deleted = update(posted(held), Message.ClickedDelete({ id: 'n1' })).model

  it('leaves the timeline and your post count at once', () => {
    const read = timeline.read(deleted)
    expect(read._tag === 'Ready' ? read.value.items.map(post => post.body) : read._tag).toEqual([
      'Newer',
      'Older',
    ])
    expect(Data.get(Card, 'you').read(deleted)).toMatchObject({ value: { postCount: 1 } })
  })

  it('waits in the outbox beside the post, so a reload keeps both', () => {
    expect(outboxStatus(Data, deleted)).toMatchObject({ waiting: 2, failed: 0 })
  })
})

describe('a chirp posted, as the server keeps it', () => {
  /** When you post, by the trace's clock; the server's runs two seconds ahead. */
  const at = 1_800_000_000_000
  const ahead = at + 2_000

  /** Remote's client over the sandbox's server as you, through JSON as a worker answers it. */
  const sandbox = (): RemoteClient['Service'] => {
    const { server, database } = openServer(memorySqlite())
    const handlers = RemoteServer.handlers(server, principalOf('you'))
    const json = Remote.json(request =>
      Effect.runPromise(
        Effect.andThen(
          TestClock.setTime(ahead),
          RemoteServer.answer(handlers, JSON.parse(request)),
        ).pipe(Effect.provide(database), Effect.provide(TestClock.layer())),
      ).then(answered => answered.body),
    )
    return {
      read: () => Effect.die('the trace answers no read'),
      query: () => Effect.die('the trace answers no query'),
      mutate: json.FoldkitRemoteMutate,
      live: () => Stream.never,
    }
  }

  it('shows at the time you posted, which the server stores, so the answer moves nothing', async () => {
    const start = ComposeForm.helpers.fill({ id: 'n1', body: 'Hello' })(held).model
    const trace = await Trace.run(Data, {
      start,
      update,
      active: {},
      client: sandbox(),
      outbox: durable,
      now: at,
      steps: [
        Message.GotComposeMessage({ message: Compose.Message.Submitted() }),
        Respond.mutation(PostChirp),
      ],
    })
    const pending = trace.entries.find(entry => entry.message._tag === 'ClockedPost')!.model
    const answered = trace.entries.find(entry => entry.message._tag === 'MutationSucceeded')!
    expect(Data.get(Line, 'n1').read(pending)).toMatchObject({ value: { createdAt: at } })
    expect(answered.message).toMatchObject({
      entities: [
        expect.objectContaining({ id: 'n1', values: expect.objectContaining({ createdAt: at }) }),
      ],
    })
    expect(Data.get(Line, 'n1').read(answered.model)).toMatchObject({ value: { createdAt: at } })
    const bodies = (model: Model) => {
      const read = timeline.read(model)
      return read._tag === 'Ready' ? read.value.items.map(post => post.body) : read._tag
    }
    expect(bodies(pending)).toEqual(['Hello', 'Newer', 'Older'])
    expect(bodies(answered.model)).toEqual(bodies(pending))
  })
})

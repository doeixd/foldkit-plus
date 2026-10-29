// @vitest-environment node
/**
 * The law over Chirp's four writes (operations-phase6-DESIGN §1): each run
 * through the page's own `Data.mutate` and through the server, as the same
 * person at the same time, the page holding every row. What the page shows
 * while a write is pending must be what the server then stores, its guards'
 * `may` included, and where the timeline and a profile list each chirp.
 */
import { Clock, Effect, Layer } from 'effect'
import { Remote } from 'foldkit-remote'
import { Law } from 'foldkit-remote/testing'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { Data, initial } from '../src/app.js'
import { Chirper } from '../src/domain.js'
import { Like, Post } from '../src/guard.js'
import {
  ByAuthor,
  EditPost,
  LikePost,
  PostChirp,
  Timeline,
  Unlike,
  likeOf,
} from '../src/operations.js'
import { openServer, principalOf } from '../src/server/server.js'
import { PEOPLE } from '../src/server/seed.js'
import { memorySqlite } from '../src/server/sqlite-node.js'

/** When the reader acted, after every seeded chirp; the server's clock reads it too. */
const NOW = Date.UTC(2026, 0, 2)

const stoppedAt = (at: number): Clock.Clock => ({
  currentTimeMillisUnsafe: () => at,
  currentTimeMillis: Effect.succeed(at),
  currentTimeNanosUnsafe: () => BigInt(at) * 1_000_000n,
  currentTimeNanos: Effect.succeed(BigInt(at) * 1_000_000n),
  monotonicTimeNanosUnsafe: () => BigInt(at) * 1_000_000n,
  monotonicTimeNanos: Effect.succeed(BigInt(at) * 1_000_000n),
  sleep: () => Effect.void,
})

const seededLikes = [
  ['p1', 'grace'],
  ['p1', 'linus'],
  ['p1', 'you'],
  ['p2', 'ada'],
  ['p2', 'linus'],
  ['p3', 'ada'],
  ['p3', 'grace'],
  ['p3', 'you'],
  ['p5', 'grace'],
] as const

const everything = [
  { entity: Chirper, ids: [...PEOPLE] },
  { entity: Post, ids: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] },
  { entity: Like, ids: seededLikes.map(([post, user]) => likeOf(post, user)) },
]
const timeline = Timeline.ref({})
const mine = ByAuthor.ref({ authorId: 'you' })

/** One write as `you`, on a freshly seeded server. */
const checked = (mutation: Parameters<typeof Law.check>[1]['mutation'], input: unknown) => {
  const { server, database } = openServer(memorySqlite())
  return Effect.runPromise(
    Law.check(Data, {
      model: initial,
      holds: everything,
      lists: [timeline, mine],
      mutation,
      input,
      now: NOW,
    }).pipe(
      Effect.provide(
        Remote.clientLayer(RemoteServer.handlers(server, principalOf('you'))).pipe(
          Layer.provide(database),
        ),
      ),
      Effect.provideService(Clock.Clock, stoppedAt(NOW)),
    ),
  )
}

describe("the law over Chirp's writes", () => {
  it.each([
    {
      what: 'a new chirp: its author, its time, its counts, may, and both lists',
      mutation: PostChirp,
      input: { id: 'p9', body: 'Hello again' },
      compares: [
        'Post:p9.body',
        'Post:p9.author',
        'Post:p9.createdAt',
        'Post:p9.likeCount',
        'Post:p9.liked',
        'Post:p9.may',
        'User:you.postCount',
        timeline.identity,
        mine.identity,
      ],
    },
    {
      what: 'an edit of your own chirp',
      mutation: EditPost,
      input: { id: 'p4', body: 'Hello, Chirp! Edited.' },
      compares: ['Post:p4.body', timeline.identity, mine.identity],
    },
    {
      what: "an edit of someone else's chirp: refused where it is made, as the server refuses it",
      mutation: EditPost,
      input: { id: 'p1', body: 'Not yours to edit.' },
      compares: ['EditPost'],
    },
    {
      what: 'a like: the post counting it, and found as yours',
      mutation: LikePost,
      input: { id: likeOf('p2', 'you'), postId: 'p2' },
      compares: [`Like:${likeOf('p2', 'you')}.post`, 'Post:p2.likeCount', 'Post:p2.liked'],
    },
    {
      what: 'a like taken back',
      mutation: Unlike,
      input: { id: likeOf('p1', 'you') },
      compares: [`Like:${likeOf('p1', 'you')}`, 'Post:p1.likeCount', 'Post:p1.liked'],
    },
  ])('$what', async ({ mutation, input, compares }) => {
    const report = await checked(mutation, input)
    expect(report.disagreed).toEqual([])
    expect(report.agreed).toEqual(expect.arrayContaining(compares))
  })
})

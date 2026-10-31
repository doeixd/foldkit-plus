/**
 * Why your profile shows a chirp the server has not listed yet, as
 * `why` says it (#248): the chirp you posted joined your posts by the
 * write that is still pending, and the list body's one term, that its author
 * is you, put it there. The timeline of a trace says the same across the post
 * and its answer, and that no read on the page went back to `Loading`.
 */
import { Effect, Option, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { Entity } from 'foldkit-entity'
import { Remote, type RemoteClient, type RemoteMessage } from 'foldkit-remote'
import { ShownBy, why, Why } from 'foldkit-remote/why'
import { Respond, Trace } from 'foldkit-remote/testing'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { ComposeForm, Data, Message, outbox, update, type Model } from '../src/app.js'
import { Compose } from '../src/compose.js'
import { Post } from '../src/guard.js'
import { ByAuthor, PostChirp } from '../src/operations.js'
import { openServer, principalOf } from '../src/server/server.js'
import { memorySqlite } from '../src/server/sqlite-node.js'
import { opened } from './opened.js'

const Line = Entity.select(Post, { body: true, author: true, createdAt: true })
/** Your own posts, as your profile reads them. */
const mine = Data.query(ByAuthor, { authorId: 'you' }, { select: Line, first: 25 })

/** Your profile, read with one chirp of yours on it. */
const held: Model = (
  [
    {
      _tag: 'ConnectionMerged',
      connection: mine.ref.identity,
      page: {
        edges: [{ key: 'Post:p1', ref: { entity: 'Post', id: 'p1' } }],
        start: { _tag: 'Terminal' },
        end: { _tag: 'Terminal' },
      },
    },
    {
      _tag: 'ReadReceived',
      requests: [{ entity: 'Post', id: 'p1', fields: ['id', 'body', 'author', 'createdAt'] }],
      result: {
        settled: [],
        entities: [
          {
            entity: 'Post',
            id: 'p1',
            values: { id: 'p1', body: 'First', author: 'User:you', createdAt: 4_000 },
          },
        ],
      },
      now: 5_000,
    },
  ] satisfies ReadonlyArray<RemoteMessage>
).reduce(Data.reduce, opened)

const posted = (model: Model): Model =>
  update(model, Message.ClockedPost({ post: { id: 'n1', body: 'Hello' }, now: 6_000 })).model

describe('why your profile shows a chirp the server has not listed', () => {
  it('names the pending write and the term that put it there', () => {
    const pending = posted(held)
    const [requestId] = Data.inspect(pending).mutations.pending
    const said = why(Data, pending, mine)

    expect(said.state).toBe('Ready')
    expect(said.because).toContainEqual(
      Why.Joined({
        list: { query: 'ByAuthor', identity: mine.ref.identity },
        row: { entity: 'Post', id: 'n1' },
        by: Option.some(
          ShownBy.Write({ requestId: requestId!, mutation: Option.some('PostChirp') }),
        ),
        terms: [{ term: 'Post.author = $authorId', truth: 'True', reason: Option.none() }],
      }),
    )
  })

  it('names nothing once the server has answered with the same list', () => {
    expect(why(Data, held, mine).because).toEqual([])
  })
})

describe('the timeline of a post', () => {
  /**
   * When you post, by the trace's clock and the server's alike: a client
   * clock far from the server's has its time refused and the server's
   * stored, which `verifyPredictions` reads as the answer disagreeing.
   */
  const at = 1_800_000_000_000

  /** Remote's client over the sandbox's server as you. */
  const sandbox = (): RemoteClient['Service'] => {
    const { server, database } = openServer(memorySqlite())
    const handlers = RemoteServer.handlers(server, principalOf('you'))
    const json = Remote.json(request =>
      Effect.runPromise(
        Effect.andThen(
          TestClock.setTime(at),
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

  it('shows the chirp joining your posts, and no read going back to Loading', async () => {
    const trace = await Trace.run(Data, {
      start: ComposeForm.helpers.fill({ id: 'n1', body: 'Hello' })(held).model,
      update,
      // Your profile is open: without a Surface reading it, retention drops the
      // list, and the timeline says so (`NotObserved`).
      active: { mine: Data.active('Mine', () => Option.some(mine)) },
      client: sandbox(),
      outbox,
      now: at,
      steps: [
        Message.GotComposeMessage({ message: Compose.Message.Submitted() }),
        Respond.mutation(PostChirp),
      ],
    })
    const steps = trace.timeline({ mine })

    // The list stays `Ready` throughout: its rows changed, its tag did not.
    expect(steps).toEqual([])
    const pending = trace.entries.find(entry => entry.message._tag === 'ClockedPost')!.model
    expect(why(Data, pending, mine).because.map(why => why._tag)).toContain('Joined')
  })
})

// @vitest-environment node
/**
 * The page and the Domain model disagree about when things happen, never
 * about what: a reservation's reply and the View's live frame arrive in
 * either order, and a reply may be lost and the write sent again. After each
 * delivery the test records what the page shows and what Remote knows of the
 * write, and the Domain model's history must hold one `StockReserved`.
 */
import { Effect, Fiber, Option, Ref } from 'effect'
import { RemoteClient } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { world as makeWorld } from '../../src/scenario/index.js'
import { page, poll } from './page.js'

const bolt = {
  id: 'p1',
  ownerId: 'ada',
  name: 'Bolt',
  status: 'published',
  stock: 10,
  reserved: 2,
  revision: 1,
}
const input = { id: 'p1', revision: 1, quantity: 3 }

/** A page signed in as ada over a hosted model holding p1, its View caught up. */
const shop = <A, E>(
  body: (
    shop: ReturnType<typeof makeWorld>,
    shown: Effect.Success<ReturnType<typeof page>>,
  ) => Effect.Effect<A, E, RemoteClient>,
) => {
  const world = makeWorld()
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* world.seed([bolt])
      yield* Ref.set(world.as, Option.some('ada'))
      const shown = yield* page('p1')
      yield* shown.read
      return yield* body(world, shown)
    }).pipe(Effect.scoped, Effect.provide(world.layer)),
  )
}

/** The Product commits after the seed's: each is one `StockReserved`. */
const reservations = (world: ReturnType<typeof makeWorld>) =>
  world.control.commits.filter(({ aggregate }) => aggregate === 'Product').length - 1

describe('reply and live observation, in either order', () => {
  it('reply then live: the write settles on its reply, then the View catches up and confirms it', async () => {
    const seen = await shop((world, shown) =>
      Effect.gen(function* () {
        yield* shown.watch
        const settle = yield* shown.start(input)
        yield* shown.reply(settle)
        const owed = yield* shown.floors
        yield* world.control.drain
        yield* shown.framesDelivered(1)
        // What the read entry does while a floor is set: read the row with its token.
        yield* shown.read
        const left = yield* shown.floors
        return { seen: shown.seen.slice(0, 5), owed, left }
      }),
    )
    expect(seen.seen).toEqual([
      { after: 'read', shows: { reserved: 2, revision: 1 }, write: 'none' },
      { after: 'subscribed', shows: { reserved: 2, revision: 1 }, write: 'none' },
      // The prediction moves what the write sets; the revision waits for the answer.
      { after: 'start', shows: { reserved: 5, revision: 1 }, write: 'Pending' },
      { after: 'reply', shows: { reserved: 5, revision: 2 }, write: 'Applied' },
      // The View's own frame, once it caught up: the same row the reply gave.
      { after: 'live frame 1', shows: { reserved: 5, revision: 2 }, write: 'Applied' },
    ])
    // The reply came while the View was behind: Remote holds the row to its receipt until a read at it answers.
    expect(seen.owed).toEqual([{ entity: 'Product', id: 'p1', token: 'Product/p1@2' }])
    expect(seen.left).toEqual([])
  })

  it('live then reply: the frame arrives while the write is pending, and the reply settles it', async () => {
    const seen = await shop((world, shown) =>
      Effect.gen(function* () {
        yield* shown.watch
        const release = world.holdReply()
        const settle = yield* shown.start(input)
        const replying = yield* Effect.forkChild(shown.reply(settle))
        // The command has run and its reply is held; the View catches up first.
        yield* poll(
          Effect.sync(() => reservations(world)),
          count => count === 1,
          'the command',
        )
        yield* world.control.drain
        yield* shown.framesDelivered(1)
        yield* release
        yield* Fiber.join(replying)
        return { seen: shown.seen, reservations: reservations(world) }
      }),
    )
    expect(seen.seen).toEqual([
      { after: 'read', shows: { reserved: 2, revision: 1 }, write: 'none' },
      { after: 'subscribed', shows: { reserved: 2, revision: 1 }, write: 'none' },
      { after: 'start', shows: { reserved: 5, revision: 1 }, write: 'Pending' },
      { after: 'live frame 1', shows: { reserved: 5, revision: 2 }, write: 'Pending' },
      { after: 'reply', shows: { reserved: 5, revision: 2 }, write: 'Applied' },
    ])
    expect(seen.reservations).toBe(1)
  })
})

describe('an observation older than one already shown', () => {
  it('is not shown after the reply that settled the write', async () => {
    const seen = await shop((world, shown) =>
      Effect.gen(function* () {
        yield* shown.watch
        const settle = yield* shown.start(input)
        yield* shown.reply(settle)
        yield* world.control.drain
        yield* shown.framesDelivered(1)
        // The View's frame from before the write, delivered late, and then a newer one.
        yield* world.deliverLate('p1', { state: bolt, cursor: 0 })
        yield* world.deliverLate('p1', {
          state: { ...bolt, reserved: 6, revision: 3 },
          cursor: 5,
        })
        yield* poll(
          Effect.sync(() => shown.seen.at(-1)?.shows),
          shows => JSON.stringify(shows) === JSON.stringify({ reserved: 6, revision: 3 }),
          'the newer frame',
        )
        return shown.seen
      }),
    )
    expect(seen).toEqual([
      { after: 'read', shows: { reserved: 2, revision: 1 }, write: 'none' },
      { after: 'subscribed', shows: { reserved: 2, revision: 1 }, write: 'none' },
      { after: 'start', shows: { reserved: 5, revision: 1 }, write: 'Pending' },
      { after: 'reply', shows: { reserved: 5, revision: 2 }, write: 'Applied' },
      { after: 'live frame 1', shows: { reserved: 5, revision: 2 }, write: 'Applied' },
      // The frame at revision 1 reaches Remote, which drops it: the row stays at revision 2.
      { after: 'live frame 2', shows: { reserved: 5, revision: 2 }, write: 'Applied' },
      { after: 'live frame 3', shows: { reserved: 6, revision: 3 }, write: 'Applied' },
    ])
  })
})

describe('a lost reply', () => {
  it('is retried as the same operation: one StockReserved, the View catches up, one reservation shown', async () => {
    const seen = await shop((world, shown) =>
      Effect.gen(function* () {
        yield* shown.watch
        world.loseReply()
        const first = yield* shown.start(input)
        yield* shown.reply(first, 'lost reply')
        const again = yield* shown.retry
        yield* shown.reply(again, 'retried reply')
        yield* world.control.drain
        yield* shown.framesDelivered(1)
        yield* shown.read
        yield* poll(shown.floors, floors => floors.length === 0, 'the View to confirm')
        return {
          seen: shown.seen,
          reservations: reservations(world),
          commandIds: world.commandIds,
        }
      }),
    )
    expect(seen.seen).toEqual([
      { after: 'read', shows: { reserved: 2, revision: 1 }, write: 'none' },
      { after: 'subscribed', shows: { reserved: 2, revision: 1 }, write: 'none' },
      { after: 'start', shows: { reserved: 5, revision: 1 }, write: 'Pending' },
      // The command ran and its reply was lost: Remote takes the prediction back.
      { after: 'lost reply', shows: { reserved: 2, revision: 1 }, write: 'Failed' },
      { after: 'retry', shows: { reserved: 5, revision: 1 }, write: 'Pending' },
      { after: 'retried reply', shows: { reserved: 5, revision: 2 }, write: 'Applied' },
      { after: 'live frame 1', shows: { reserved: 5, revision: 2 }, write: 'Applied' },
      { after: 'read', shows: { reserved: 5, revision: 2 }, write: 'Applied' },
    ])
    expect(seen.commandIds).toHaveLength(2)
    expect(seen.commandIds[0]).toBe(seen.commandIds[1])
    expect(seen.reservations).toBe(1)
  })
})

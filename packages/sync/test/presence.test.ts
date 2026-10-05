import { Clock, Effect, Fiber, Layer, PubSub, Schema, Stream, type Scope } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'
import {
  createPresence,
  createPresenceHub,
  loopbackPresenceChannel,
  servePresence,
  socketPresenceChannel,
  type PresenceOptions,
  type SocketLike,
  type PresenceUpdate,
} from '../src/index.js'
import { socketPair } from './sockets.js'

interface Cursor {
  readonly cursor: number
}

const decodeCursor = Schema.decodeUnknownSync(Schema.Struct({ cursor: Schema.Number }))
const make = (options: Omit<PresenceOptions<Cursor>, 'decodeValue'>) =>
  createPresence<Cursor>({ decodeValue: decodeCursor, ...options })

/**
 * Runs a presence program under a deterministic `TestClock` and a scope.
 *
 * The casts cover a gap in the pinned Effect rc: `TestClock.layer()` installs the
 * `TestClock` as `Clock.Clock` at runtime, but `provide` does not narrow `Clock`
 * out of a `Clock | Scope` requirement, so `Effect.scoped` still sees it.
 */
const run = (program: Effect.Effect<void, never, Clock.Clock | Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.provide(
        program,
        TestClock.layer() as unknown as Layer.Layer<Clock.Clock>,
      ) as Effect.Effect<void, never, Scope.Scope>,
    ),
  )

/** Lets the forked channel consumers drain what was just published. */
const settle = Effect.yieldNow.pipe(Effect.andThen(Effect.yieldNow))

/** A channel that records what this peer sends on it. */
const recording = Effect.gen(function* () {
  const channel = yield* loopbackPresenceChannel<Cursor>()
  const sent: Array<Cursor | null> = []
  return {
    sent,
    channel: {
      ...channel,
      publish: (update: PresenceUpdate<Cursor>) =>
        Effect.sync(() => sent.push(update.value)).pipe(Effect.andThen(channel.publish(update))),
    },
  }
})

describe('a throttled presence', () => {
  const at = (millis: number) => TestClock.setTime(millis).pipe(Effect.andThen(settle))

  it('sends at once, then only the latest value set within the interval, when it ends', () =>
    run(
      Effect.gen(function* () {
        const { sent, channel } = yield* recording
        const presence = yield* make({ id: 'a', ttl: '1 second', channel, throttle: '100 millis' })
        yield* presence.set({ cursor: 1 })
        yield* at(10)
        yield* presence.set({ cursor: 2 })
        yield* at(20)
        yield* presence.set({ cursor: 3 })
        // The peer's own value moves at once; the channel waits.
        expect((yield* presence.peers)[0]!.value).toEqual({ cursor: 3 })
        expect(sent).toEqual([{ cursor: 1 }])
        yield* at(99)
        expect(sent).toEqual([{ cursor: 1 }])
        yield* at(100)
        expect(sent).toEqual([{ cursor: 1 }, { cursor: 3 }])
      }),
    ))

  it('keeps sending once per interval while values keep coming, and at once after a lull', () =>
    run(
      Effect.gen(function* () {
        const { sent, channel } = yield* recording
        const presence = yield* make({ id: 'a', ttl: '1 second', channel, throttle: '100 millis' })
        yield* presence.set({ cursor: 1 })
        yield* at(50)
        yield* presence.set({ cursor: 2 })
        yield* at(100)
        yield* presence.set({ cursor: 3 })
        yield* at(150)
        expect(sent).toEqual([{ cursor: 1 }, { cursor: 2 }])
        yield* at(200)
        expect(sent).toEqual([{ cursor: 1 }, { cursor: 2 }, { cursor: 3 }])
        yield* at(400)
        yield* presence.set({ cursor: 4 })
        expect(sent.at(-1)).toEqual({ cursor: 4 })
      }),
    ))

  it('sends every value without a throttle, though the clock goes back', () =>
    run(
      Effect.gen(function* () {
        const { sent, channel } = yield* recording
        const presence = yield* make({ id: 'a', ttl: '1 second', channel })
        yield* at(10_000)
        yield* presence.set({ cursor: 1 })
        yield* at(5_000)
        yield* presence.set({ cursor: 2 })
        yield* presence.set({ cursor: 3 })
        expect(sent).toEqual([{ cursor: 1 }, { cursor: 2 }, { cursor: 3 }])
      }),
    ))

  it('holds a value for no more than one interval after the clock goes back', () =>
    run(
      Effect.gen(function* () {
        const { sent, channel } = yield* recording
        const presence = yield* make({ id: 'a', ttl: '1 second', channel, throttle: '100 millis' })
        yield* at(10_000)
        yield* presence.set({ cursor: 1 })
        yield* at(5_000)
        yield* presence.set({ cursor: 2 })
        yield* at(5_100)
        expect(sent).toEqual([{ cursor: 1 }, { cursor: 2 }])
      }),
    ))

  it('sends nothing held once closed', () =>
    run(
      Effect.gen(function* () {
        const { sent, channel } = yield* recording
        const presence = yield* make({ id: 'a', ttl: '1 second', channel, throttle: '100 millis' })
        yield* presence.set({ cursor: 1 })
        yield* at(10)
        yield* presence.set({ cursor: 2 })
        yield* presence.close
        yield* at(500)
        expect(sent).toEqual([{ cursor: 1 }])
      }),
    ))

  it('sends a value set after leaving', () =>
    run(
      Effect.gen(function* () {
        const { sent, channel } = yield* recording
        const presence = yield* make({ id: 'a', ttl: '1 second', channel, throttle: '100 millis' })
        yield* presence.set({ cursor: 1 })
        yield* presence.leave
        yield* at(10)
        yield* presence.set({ cursor: 2 })
        yield* at(100)
        expect(sent).toEqual([{ cursor: 1 }, null, { cursor: 2 }])
      }),
    ))

  it('sends a departure at once and never the value it was holding', () =>
    run(
      Effect.gen(function* () {
        const { sent, channel } = yield* recording
        const presence = yield* make({ id: 'a', ttl: '1 second', channel, throttle: '100 millis' })
        yield* presence.set({ cursor: 1 })
        yield* at(10)
        yield* presence.set({ cursor: 2 })
        yield* presence.leave
        yield* at(500)
        expect(sent).toEqual([{ cursor: 1 }, null])
      }),
    ))
})

describe('presence', () => {
  it('expires a peer that stops refreshing after its ttl', () =>
    run(
      Effect.gen(function* () {
        const presence = yield* make({ id: 'a', ttl: '100 millis' })

        yield* presence.set({ cursor: 1 })
        expect(yield* presence.peers).toHaveLength(1)

        yield* TestClock.adjust('100 millis')
        expect(yield* presence.peers).toHaveLength(1)

        yield* TestClock.adjust('1 millis')
        expect(yield* presence.peers).toEqual([])
      }),
    ))

  it('changes emits the live peers when the set changes', () =>
    run(
      Effect.gen(function* () {
        const channel = yield* loopbackPresenceChannel<Cursor>()
        const a = yield* make({ id: 'a', ttl: '100 millis', channel })
        const b = yield* make({ id: 'b', ttl: '100 millis', channel })

        const collected = yield* b.changes.pipe(
          Stream.filter(peers => peers.some(peer => peer.id === 'a')),
          Stream.take(1),
          Stream.runCollect,
          Effect.forkScoped,
        )
        yield* settle
        yield* a.set({ cursor: 1 })
        yield* settle

        const emissions = [...(yield* Fiber.join(collected))]
        expect(emissions[0]).toEqual([{ id: 'a', value: { cursor: 1 }, updatedAt: 0 }])
      }),
    ))

  it('keeps a peer live while it refreshes before the ttl', () =>
    run(
      Effect.gen(function* () {
        const presence = yield* make({ id: 'a', ttl: '100 millis' })

        yield* presence.set({ cursor: 1 })
        yield* TestClock.adjust('90 millis')
        yield* presence.set({ cursor: 2 })

        yield* TestClock.adjust('60 millis')
        expect(yield* presence.peers).toEqual([{ id: 'a', value: { cursor: 2 }, updatedAt: 90 }])

        yield* TestClock.adjust('41 millis')
        expect(yield* presence.peers).toEqual([])
      }),
    ))

  it('prunes expired peers and notifies only when something went', () =>
    run(
      Effect.gen(function* () {
        const presence = yield* make({ id: 'a', ttl: '100 millis' })
        let notifications = 0
        presence.subscribe(() => {
          notifications += 1
        })

        yield* presence.set({ cursor: 1 })
        expect(notifications).toBe(1)

        yield* TestClock.adjust('50 millis')
        yield* presence.prune
        expect(notifications).toBe(1)

        yield* TestClock.adjust('51 millis')
        yield* presence.prune
        expect(notifications).toBe(2)
      }),
    ))

  it('broadcasts to other peers over the channel and drops a departure', () =>
    run(
      Effect.gen(function* () {
        const channel = yield* loopbackPresenceChannel<Cursor>()
        const a = yield* make({ id: 'a', ttl: '100 millis', channel })
        const b = yield* make({ id: 'b', ttl: '100 millis', channel })
        // Let the forked consumer subscribe before anything is published.
        yield* settle

        yield* a.set({ cursor: 3 })
        yield* settle
        expect(yield* b.peers).toEqual([{ id: 'a', value: { cursor: 3 }, updatedAt: 0 }])

        yield* b.set({ cursor: 5 })
        yield* settle
        expect((yield* a.peers).map(peer => peer.id)).toEqual(['a', 'b'])

        yield* a.leave
        yield* settle
        expect((yield* a.peers).map(peer => peer.id)).toEqual(['b'])
        expect((yield* b.peers).map(peer => peer.id)).toEqual(['b'])
      }),
    ))

  it('notifies subscribers, stops on unsubscribe, and survives a throwing one', () =>
    run(
      Effect.gen(function* () {
        const channel = yield* loopbackPresenceChannel<Cursor>()
        const a = yield* make({ id: 'a', ttl: '100 millis', channel })
        const b = yield* make({ id: 'b', ttl: '100 millis', channel })
        // Let the forked consumer subscribe before anything is published.
        yield* settle
        b.subscribe(() => {
          throw new Error('subscriber failed')
        })
        let notifications = 0
        const stop = b.subscribe(() => {
          notifications += 1
        })

        yield* a.set({ cursor: 1 })
        yield* settle
        expect(notifications).toBe(1)

        stop()
        yield* a.set({ cursor: 2 })
        yield* settle
        expect(notifications).toBe(1)
      }),
    ))

  it('stops receiving once closed', () =>
    run(
      Effect.gen(function* () {
        const channel = yield* loopbackPresenceChannel<Cursor>()
        const a = yield* make({ id: 'a', ttl: '100 millis', channel })
        const b = yield* make({ id: 'b', ttl: '100 millis', channel })
        // Let the forked consumer subscribe before anything is published.
        yield* settle

        yield* b.close
        yield* a.set({ cursor: 9 })
        yield* settle
        expect(yield* b.peers).toEqual([])
      }),
    ))

  it('carries presence between peers through a hub over sockets', () =>
    run(
      Effect.gen(function* () {
        const hub = createPresenceHub<Cursor>()
        const a = socketPair()
        const b = socketPair()
        servePresence(a.server, hub, { peerId: 'a' })
        servePresence(b.server, hub, { peerId: 'b' })

        const presenceA = yield* make({
          id: 'a',
          ttl: '100 millis',
          channel: yield* socketPresenceChannel<Cursor>(a.client),
        })
        const presenceB = yield* make({
          id: 'b',
          ttl: '100 millis',
          channel: yield* socketPresenceChannel<Cursor>(b.client),
        })
        yield* settle

        yield* presenceA.set({ cursor: 1 })
        yield* settle
        expect((yield* presenceB.peers).map(peer => [peer.id, peer.value.cursor])).toEqual([
          ['a', 1],
        ])

        yield* presenceA.leave
        yield* settle
        expect(yield* presenceB.peers).toEqual([])
      }),
    ))

  it('ignores messages that are not presence updates', () => {
    const hub = createPresenceHub<Cursor>()
    const { client, server } = socketPair()
    const seen: Array<unknown> = []
    hub.join(update => seen.push(update))
    servePresence(server, hub, { peerId: 'a' })

    for (const frame of [
      'not json',
      'null',
      '3',
      JSON.stringify({ id: 'x', cursor: 0, pending: [] }),
    ])
      client.send(frame)

    expect(seen).toEqual([])
  })

  it('leaves the hub when its socket closes', () => {
    const hub = createPresenceHub<Cursor>()
    // A socket that goes on recording what it is sent, so only leaving the hub stops it.
    const sent: Array<string> = []
    const closes = new Set<() => void>()
    const socket: SocketLike = {
      send: data => sent.push(data),
      close: () => {},
      onMessage: () => () => {},
      onClose: listener => {
        closes.add(listener)
        return () => closes.delete(listener)
      },
    }
    servePresence(socket, hub, { peerId: 'a' })
    hub.publish({ id: 'b', value: { cursor: 1 } })
    expect(sent).toHaveLength(1)
    for (const close of [...closes]) close()
    hub.publish({ id: 'b', value: { cursor: 2 } })
    expect(sent).toHaveLength(1)
  })

  it('stamps the connection identity, ignoring a client-supplied id', () => {
    const hub = createPresenceHub<Cursor>()
    const { client, server } = socketPair()
    const seen: Array<{ id: string; value: Cursor | null }> = []
    hub.join(update => seen.push(update))
    servePresence(server, hub, { peerId: 'a' })

    // A client claims to be "b"; the server must attribute the update to "a".
    client.send(JSON.stringify({ presence: { id: 'b', value: { cursor: 9 } } }))

    expect(seen).toEqual([{ id: 'a', value: { cursor: 9 } }])
  })

  it('delivers to every peer when one send throws', () => {
    const hub = createPresenceHub<Cursor>()
    const seen: Array<string> = []
    hub.join(() => {
      throw new Error('dead socket')
    })
    hub.join(update => seen.push(update.id))

    hub.publish({ id: 'a', value: { cursor: 1 } })

    expect(seen).toEqual(['a'])
  })

  it('drops a peer value that fails the contract', () =>
    run(
      Effect.gen(function* () {
        const channel = yield* loopbackPresenceChannel<Cursor>()
        const b = yield* make({ id: 'b', ttl: '100 millis', channel })
        // Let the forked consumer subscribe before anything is published.
        yield* settle

        // A hostile peer bypasses the typed publish with a wrong-shaped value.
        yield* PubSub.publish(channel.updates, {
          id: 'a',
          value: { cursor: 'not a number' } as unknown as Cursor,
        })
        yield* settle

        expect(yield* b.peers).toEqual([])
      }),
    ))

  it('does not store or re-announce the echo of its own broadcast', () =>
    run(
      Effect.gen(function* () {
        const channel = yield* loopbackPresenceChannel<Cursor>()
        const a = yield* make({ id: 'a', ttl: '100 millis', channel })
        yield* settle
        let notifications = 0
        a.subscribe(() => {
          notifications += 1
        })

        yield* a.set({ cursor: 1 })
        yield* settle

        // The set notifies once; the channel's echo of our own update must not.
        expect(notifications).toBe(1)
      }),
    ))

  it('keeps consuming after dropping a value that fails the contract', () =>
    run(
      Effect.gen(function* () {
        const channel = yield* loopbackPresenceChannel<Cursor>()
        const a = yield* make({ id: 'a', ttl: '100 millis', channel })
        const b = yield* make({ id: 'b', ttl: '100 millis', channel })
        yield* settle

        yield* PubSub.publish(channel.updates, {
          id: 'a',
          value: { cursor: 'not a number' } as unknown as Cursor,
        })
        yield* settle
        expect(yield* b.peers).toEqual([])

        // The invalid value must not kill the consumer: a later valid update
        // still arrives.
        yield* a.set({ cursor: 3 })
        yield* settle
        expect((yield* b.peers).map(peer => [peer.id, peer.value.cursor])).toEqual([['a', 3]])
      }),
    ))

  it('does not notify when a departure names an unknown peer', () =>
    run(
      Effect.gen(function* () {
        const channel = yield* loopbackPresenceChannel<Cursor>()
        const b = yield* make({ id: 'b', ttl: '100 millis', channel })
        yield* settle
        let notifications = 0
        b.subscribe(() => {
          notifications += 1
        })

        yield* PubSub.publish(channel.updates, { id: 'ghost', value: null })
        yield* settle

        expect(notifications).toBe(0)
      }),
    ))

  it('does not broadcast a departure after close', () =>
    run(
      Effect.gen(function* () {
        const channel = yield* loopbackPresenceChannel<Cursor>()
        const a = yield* make({ id: 'a', ttl: '100 millis', channel })
        const b = yield* make({ id: 'b', ttl: '100 millis', channel })
        yield* settle
        yield* b.set({ cursor: 2 })
        yield* settle
        expect((yield* a.peers).map(peer => peer.id)).toEqual(['b'])

        yield* b.close
        yield* b.leave
        yield* settle

        // A closed presence never touches the channel.
        expect((yield* a.peers).map(peer => peer.id)).toEqual(['b'])
      }),
    ))

  it('ignores a socket frame without a server-stamped id', () =>
    run(
      Effect.gen(function* () {
        const { client, server } = socketPair()
        const presence = yield* make({
          id: 'a',
          ttl: '100 millis',
          channel: yield* socketPresenceChannel<Cursor>(client),
        })
        yield* settle

        // The server owns peer identity; an unstamped frame is dropped.
        server.send(JSON.stringify({ presence: { value: { cursor: 1 } } }))
        yield* settle

        expect(yield* presence.peers).toEqual([])
      }),
    ))

  it('ignores mutations after close', () =>
    run(
      Effect.gen(function* () {
        const channel = yield* loopbackPresenceChannel<Cursor>()
        const presence = yield* make({ id: 'a', ttl: '100 millis', channel })

        yield* presence.close
        yield* presence.set({ cursor: 1 })
        expect(yield* presence.peers).toEqual([])
      }),
    ))
})

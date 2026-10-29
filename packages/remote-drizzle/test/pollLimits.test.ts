// @vitest-environment node
/**
 * `pollLive` under `RemoteServer.handlers`: a subscription naming more ids of
 * its Entity than `maxIdsPerEntity` is refused before a row is read, and one
 * at the limit never reads more ids a tick than the limit, however its
 * requirements repeat an id.
 */
import { Effect, Fiber, Layer, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { RpcTest } from 'effect/rpc'
import { REMOTE_PROTOCOL_VERSION, RemoteRpc } from 'foldkit-remote'
import { RemoteServer, type EntitySource } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { databaseLayer, pollLive, type DrizzleDatabase } from '../src/index.js'

const LIMIT = 3

/** A table every id of which holds a row, its reads recorded by call. */
const counted = () => {
  const reads: Array<ReadonlyArray<string>> = []
  const source: EntitySource<string, DrizzleDatabase> = {
    entity: 'Todo',
    read: ({ ids }) =>
      Effect.sync(() => {
        reads.push(ids)
        return ids.map(id => ({ id, values: { title: `${id} at ${reads.length}` } }))
      }),
  }
  return { reads, source }
}

/** `count` distinct ids, each asked twice: the limit counts ids, not requirements. */
const requirementsFor = (count: number) =>
  Array.from({ length: count }, (_, at) => [
    { entity: 'Todo', id: `t${at}`, fields: ['title'] },
    { entity: 'Todo', id: `t${at}`, fields: ['title', 'id'] },
  ]).flat()

/** Opens a live stream for `count` ids and lets `ticks` polls run; how it ended, if it did. */
const poll = (source: EntitySource<string, DrizzleDatabase>, count: number, ticks: number) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(RemoteRpc)
      const fiber = yield* client
        .FoldkitRemoteLive({
          version: REMOTE_PROTOCOL_VERSION,
          requirements: requirementsFor(count),
          after: 0,
        })
        .pipe(Stream.runDrain, Effect.flip, Effect.forkChild)
      for (let i = 0; i < 100; i++) yield* Effect.yieldNow
      for (let tick = 0; tick < ticks; tick++) {
        yield* TestClock.adjust('1 second')
        for (let i = 0; i < 100; i++) yield* Effect.yieldNow
      }
      const exit = fiber.pollUnsafe()
      yield* Fiber.interrupt(fiber)
      return exit === undefined ? 'running' : exit
    }).pipe(
      Effect.scoped,
      Effect.provide(
        RemoteRpc.toLayer(
          RemoteServer.handlers(
            RemoteServer.make({
              entities: [source],
              live: [pollLive(source, { every: '1 second' })],
            }),
            'ada',
            { maxIdsPerEntity: LIMIT },
          ),
        ),
      ),
      // The source is in memory: the database is never asked.
      Effect.provide(Layer.merge(TestClock.layer(), databaseLayer({}))),
    ),
  )

describe('pollLive under maxIdsPerEntity', () => {
  it('is refused before a row is read when it asks for more ids than the limit', async () => {
    const { reads, source } = counted()
    const ended = await poll(source, LIMIT + 1, 3)
    expect(ended).toMatchObject({
      _tag: 'Success',
      value: { _tag: 'RemoteLiveRefused' },
    })
    expect(reads).toEqual([])
  })

  it('polls at the limit, and never reads more ids a tick than it', async () => {
    const { reads, source } = counted()
    expect(await poll(source, LIMIT, 3)).toBe('running')
    // The opening read and three ticks.
    expect(reads).toHaveLength(4)
    for (const ids of reads) expect(ids).toEqual(['t0', 't1', 't2'])
  })
})

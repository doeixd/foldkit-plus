/**
 * The connection timeout: while an attempt is connecting, the page's own
 * Subscription gives up after five seconds of Effect's clock, as upstream's
 * `Effect.timeout` on the acquire did. Run on the TestClock.
 */
import { Effect, Fiber, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { ConnectionState, Message, type Model, init, pageSubscriptions } from '../src/main.js'

const { connectionTimeout } = pageSubscriptions

const idleModel: Model = init().model

/** What the timeout emits within `millis` of virtual time for `model`. */
const emittedWithin = (model: Model, millis: number): Promise<ReadonlyArray<Message>> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const emitted: Array<Message> = []
      const fiber = yield* Effect.forkChild(
        Stream.runForEach(
          connectionTimeout.dependenciesToStream(connectionTimeout.modelToDependencies(model)),
          message => Effect.sync(() => void emitted.push(message)),
        ),
      )
      for (let i = 0; i < 100; i++) yield* Effect.yieldNow
      yield* TestClock.adjust(millis)
      yield* Fiber.interrupt(fiber)
      return emitted
    }).pipe(Effect.provide(TestClock.layer())),
  )

describe('the connection timeout', () => {
  const connecting = modifyFields(idleModel, { connection: () => ConnectionState.Connecting() })

  test('fails the attempt after five seconds of connecting, and not before', async () => {
    expect(await emittedWithin(connecting, 4_999)).toEqual([])
    expect(await emittedWithin(connecting, 5_000)).toEqual([
      Message.FailedConnect({ error: 'Connection timeout' }),
    ])
  })

  test.each([
    ['disconnected', ConnectionState.Disconnected()],
    ['connected', ConnectionState.Connected()],
    ['failed', ConnectionState.Error({ error: 'Connection error' })],
  ])('never fires while %s', async (_, connection) => {
    expect(
      await emittedWithin(modifyFields(idleModel, { connection: () => connection }), 60_000),
    ).toEqual([])
  })
})

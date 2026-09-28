/**
 * The connection timeout: the socket bundle, placed with five seconds, closes
 * an attempt still connecting and reports `TimedOut`, as upstream's
 * `Effect.timeout` on the acquire gave up. Run on the TestClock, against the
 * page's own lifted Subscription.
 */
import { Effect, Fiber, Option, Queue, Ref, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { modifyFields } from 'foldkit/struct'
import { Socket, WebSocketMessage, type WebSocketModel } from 'foldkit-primitives/net'
import { describe, expect, test } from 'vitest'

import { ConnectionState, type Message, type Model, init, subscriptions } from '../src/main.js'
import { FakeSocket, fromSocket } from './fixtures.js'

const connectTimeout = subscriptions['ChatSocket@chatSocket/connectTimeout']!

const idleModel: Model = init().model

const at = (connection: ConnectionState, status: WebSocketModel['status']): Model =>
  modifyFields(idleModel, {
    connection: () => connection,
    chatSocket: socket => ({ ...socket, status }),
  })

/** What the timeout emits within `millis` of virtual time for `model`, the socket still connecting. */
const emittedWithin = (model: Model, millis: number): Promise<ReadonlyArray<Message>> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const events = yield* Queue.unbounded<WebSocketMessage>()
      const socket = new FakeSocket('wss://ws.postman-echo.com/raw')
      const dependencies = connectTimeout.modelToDependencies(model)
      const emitted: Array<Message> = []
      const fiber = yield* Effect.forkChild(
        Stream.runForEach(
          connectTimeout.dependenciesToStream(dependencies, () => dependencies),
          message => Effect.sync(() => void emitted.push(message)),
        ).pipe(Effect.provideServiceEffect(Socket._tag, Ref.make(Option.some({ socket, events })))),
      )
      for (let i = 0; i < 100; i++) yield* Effect.yieldNow
      yield* TestClock.adjust(millis)
      for (let i = 0; i < 100; i++) yield* Effect.yieldNow
      yield* Fiber.interrupt(fiber)
      return emitted
    }).pipe(Effect.provide(TestClock.layer())),
  )

describe('the connection timeout', () => {
  const connecting = at(ConnectionState.Connecting(), 'connecting')

  test('fails the attempt after five seconds of connecting, and not before', async () => {
    expect(await emittedWithin(connecting, 4_999)).toEqual([])
    expect(await emittedWithin(connecting, 5_000)).toEqual([
      fromSocket(WebSocketMessage.TimedOut()),
    ])
  })

  test.each([
    ['disconnected', at(ConnectionState.Disconnected(), 'closed')],
    ['connected', at(ConnectionState.Connected(), 'open')],
    ['failed', at(ConnectionState.Error({ error: 'Connection error' }), 'closed')],
  ])('never fires while %s', async (_, model) => {
    expect(await emittedWithin(model, 60_000)).toEqual([])
  })
})

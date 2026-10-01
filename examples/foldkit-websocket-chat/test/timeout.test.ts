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

import { type Message, type Model, init, subscriptions } from '../src/main.js'
import { FakeSocket, fromSocket } from './fixtures.js'

const connectTimeout = subscriptions['ChatSocket@chatSocket/connectTimeout']!

const idleModel: Model = init().model

const at = (wantConnection: boolean, socket: WebSocketModel): Model =>
  modifyFields(idleModel, {
    wantConnection: () => wantConnection,
    chatSocket: () => socket,
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
  const connecting = at(true, {
    url: 'wss://ws.postman-echo.com/raw',
    status: 'connecting',
    lastError: null,
    opened: false,
  })

  test('fails the attempt after five seconds of connecting, and not before', async () => {
    expect(await emittedWithin(connecting, 4_999)).toEqual([])
    expect(await emittedWithin(connecting, 5_000)).toEqual([
      fromSocket(WebSocketMessage.TimedOut()),
    ])
  })

  test.each([
    ['disconnected', at(false, { url: 'x', status: 'closed', lastError: null, opened: false })],
    ['connected', at(true, { url: 'x', status: 'open', lastError: null, opened: true })],
    [
      'failed',
      at(false, { url: 'x', status: 'closed', lastError: 'Connection error', opened: false }),
    ],
  ])('never fires while %s', async (_, model) => {
    expect(await emittedWithin(model, 60_000)).toEqual([])
  })
})

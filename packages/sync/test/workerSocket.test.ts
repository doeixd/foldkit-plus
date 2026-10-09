// @vitest-environment node
/**
 * `workerSocket`: Sync's socket over an accepted `WebSocket`. Frames cross
 * both ways, and the socket closing, erroring, or being closed fires
 * `onClose` once, which is how a host stops serving it.
 */
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { layerSocket, serveSocket, Transport, workerSocket } from '../src/index.js'
import { FakeWebSocket } from './sockets.js'

const socket = (fake: FakeWebSocket) => workerSocket(fake as unknown as WebSocket)

const settle = () => new Promise(resolve => setTimeout(resolve, 20))

describe('workerSocket', () => {
  it('carries frames both ways', async () => {
    const [left, right] = FakeWebSocket.linked()
    const atLeft: Array<string> = []
    const atRight: Array<string> = []
    socket(left).onMessage(data => atLeft.push(data))
    socket(right).onMessage(data => atRight.push(data))
    left.send('to the right')
    right.send('to the left')
    await settle()
    expect(atRight).toEqual(['to the right'])
    expect(atLeft).toEqual(['to the left'])
  })

  it('answers an exchange served at the other end', async () => {
    const [client, server] = FakeWebSocket.linked()
    const stop = serveSocket(socket(server), {
      exchange: cursor => ({ answered: cursor }),
    })
    const reply = await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* Effect.service(Transport)
        return yield* transport.exchange(7, [])
      }).pipe(Effect.provide(layerSocket({ makeSocket: () => socket(client) })), Effect.scoped),
    )
    expect(reply).toEqual({ answered: 7 })
    stop()
  })

  it.each([
    [
      'close()',
      (wrapped: ReturnType<typeof socket>, peer: FakeWebSocket, _local: FakeWebSocket) => {
        wrapped.close()
        wrapped.close()
        peer.close()
      },
    ],
    [
      'a peer close',
      (_wrapped: ReturnType<typeof socket>, peer: FakeWebSocket, _local: FakeWebSocket) => {
        peer.close()
        peer.close()
      },
    ],
    [
      'an error on its own',
      (_wrapped: ReturnType<typeof socket>, _peer: FakeWebSocket, local: FakeWebSocket) => {
        local.emit('error', {})
      },
    ],
  ])('fires onClose once, on %s', async (_, end) => {
    const [client, server] = FakeWebSocket.linked()
    const wrapped = socket(server)
    let closes = 0
    wrapped.onClose(() => {
      closes += 1
    })
    end(wrapped, client, server)
    await settle()
    expect(closes).toBe(1)
    // A listener that comes after the close still hears of it.
    wrapped.onClose(() => {
      closes += 1
    })
    expect(closes).toBe(2)
  })
})

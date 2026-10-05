// @vitest-environment node
/**
 * `portSocket`: Sync's socket over a `MessagePort`. Frames cross both ways,
 * other data on the port is ignored, and `onClose` fires once, on `close()`
 * or an aborted signal, which is how a host stops serving a pane that left.
 */
import { Effect, Fiber } from 'effect'
import { describe, expect, it } from 'vitest'
import { layerSocket, portSocket, serveSocket, Transport, type SocketLike } from '../src/index.js'

const settle = () => new Promise(resolve => setTimeout(resolve, 20))

/** Every message that arrives on `port`, as posted. */
const received = (port: MessagePort): Array<unknown> => {
  const seen: Array<unknown> = []
  port.addEventListener('message', event => seen.push(event.data))
  port.start()
  return seen
}

describe('portSocket', () => {
  it('carries frames both ways and ignores what is not a string', async () => {
    const { port1, port2 } = new MessageChannel()
    const left = portSocket(port1)
    const right = portSocket(port2)
    const atLeft: Array<string> = []
    const atRight: Array<string> = []
    left.onMessage(data => atLeft.push(data))
    right.onMessage(data => atRight.push(data))
    left.send('to the right')
    right.send('to the left')
    port2.postMessage({ not: 'a frame' })
    await settle()
    expect(atRight).toEqual(['to the right'])
    expect(atLeft).toEqual(['to the left'])
    left.close()
  })

  it('answers an exchange served at the other end', async () => {
    const { port1, port2 } = new MessageChannel()
    const stop = serveSocket(portSocket(port2), {
      exchange: cursor => ({ answered: cursor }),
    })
    const reply = await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* Effect.service(Transport)
        return yield* transport.exchange(7, [])
      }).pipe(Effect.provide(layerSocket({ makeSocket: () => portSocket(port1) })), Effect.scoped),
    )
    expect(reply).toEqual({ answered: 7 })
    stop()
  })

  const ends: ReadonlyArray<
    readonly [string, (socket: SocketLike, abort: AbortController) => void]
  > = [
    [
      'close()',
      socket => {
        socket.close()
        socket.close()
      },
    ],
    [
      'an aborted signal',
      (_, abort) => {
        abort.abort()
        abort.abort()
      },
    ],
  ]
  it.each(ends)('fires onClose once, on %s', (_, end) => {
    const abort = new AbortController()
    const socket = portSocket(new MessageChannel().port1, { signal: abort.signal })
    let closes = 0
    socket.onClose(() => {
      closes += 1
    })
    end(socket, abort)
    expect(closes).toBe(1)
    // A listener that comes after the close still hears of it.
    socket.onClose(() => {
      closes += 1
    })
    expect(closes).toBe(2)
  })

  it('is closed from the start when its signal already aborted', () => {
    const socket = portSocket(new MessageChannel().port1, { signal: AbortSignal.abort() })
    let closes = 0
    socket.onClose(() => {
      closes += 1
    })
    expect(closes).toBe(1)
  })

  it('stops serving once the signal aborts: no notice reaches the port', async () => {
    const { port1, port2 } = new MessageChannel()
    const abort = new AbortController()
    let notify = (): void => {}
    serveSocket(portSocket(port2, { signal: abort.signal }), {
      exchange: () => ({}),
      changes: listener => {
        notify = listener
        return () => {
          notify = () => {}
        }
      },
    })
    const seen = received(port1)
    notify()
    await settle()
    expect(seen).toEqual([JSON.stringify({ notify: true })])
    abort.abort()
    notify()
    await settle()
    expect(seen).toHaveLength(1)
  })

  it('reconnects through makeSocket when its port closes', async () => {
    const opened: Array<SocketLike> = []
    const fiber = Effect.runFork(
      Effect.gen(function* () {
        yield* Effect.service(Transport)
        yield* Effect.never
      }).pipe(
        Effect.provide(
          layerSocket({
            makeSocket: () => {
              const socket = portSocket(new MessageChannel().port1)
              opened.push(socket)
              return socket
            },
            retryBase: '1 millis',
          }),
        ),
        Effect.scoped,
      ),
    )
    await expect.poll(() => opened.length).toBe(1)
    opened[0]!.close()
    await expect.poll(() => opened.length).toBe(2)
    await Effect.runPromise(Fiber.interrupt(fiber))
  })
})

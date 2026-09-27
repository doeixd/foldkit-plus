import { Effect, Fiber, Stream } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import {
  layerFromPromise,
  layerLoopback,
  layerSocket,
  nativeSocket,
  sequence,
  serveSocket,
  toPromise,
  Transport,
  type SocketLike,
} from '../src/index.js'
import { socketPair } from './sockets.js'

const exchange = Effect.gen(function* () {
  const transport = yield* Effect.service(Transport)
  return yield* transport.exchange(0, [])
}).pipe(Effect.result)

describe('the transport service', () => {
  it('provides an in-process loopback layer', async () => {
    const program = Effect.gen(function* () {
      const transport = yield* Effect.service(Transport)
      return yield* transport.exchange(3, [])
    })

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(layerLoopback((cursor, pending) => ({ cursor, pending })))),
    )

    expect(result).toEqual({ cursor: 3, pending: [] })
  })

  it('wraps a throwing handler as a transport error', async () => {
    const program = Effect.gen(function* () {
      const transport = yield* Effect.service(Transport)
      return yield* transport.exchange(0, [])
    }).pipe(Effect.result)

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(
          layerLoopback(() => {
            throw new Error('down')
          }),
        ),
      ),
    )

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'SyncTransportError', message: 'down' },
    })
  })

  it('wraps a promise client and bridges back to one', async () => {
    const promise = layerFromPromise({ exchange: async (cursor: number) => ({ cursor }) })
    expect(await Effect.runPromise(exchange.pipe(Effect.provide(promise)))).toMatchObject({
      _tag: 'Success',
      success: { cursor: 0 },
    })

    expect(
      await toPromise({ exchange: cursor => Effect.succeed({ cursor }) }).exchange(sequence(4), []),
    ).toEqual({ cursor: 4 })
  })
})

const withSocket = (client: SocketLike) =>
  exchange.pipe(Effect.provide(layerSocket({ url: 'ws://test', makeSocket: () => client })))

describe('the socket transport', () => {
  it('sends one frame and resolves the matching reply', async () => {
    const { client, server } = socketPair()
    server.onMessage(data => {
      const frame = JSON.parse(data) as { id: string }
      server.send(JSON.stringify({ id: frame.id, result: { operations: [], rejected: [] } }))
    })

    expect(await Effect.runPromise(withSocket(client))).toMatchObject({
      _tag: 'Success',
      success: { operations: [], rejected: [] },
    })
  })

  it('notifies a client of each commit it serves, which the client hears as a change', async () => {
    const { client, server } = socketPair()
    const listeners = new Set<() => void>()
    const stop = serveSocket(server, {
      exchange: () => ({ operations: [], rejected: [] }),
      changes: listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    })
    const program = Effect.gen(function* () {
      const transport = yield* Effect.service(Transport)
      const heard = yield* transport.changes!.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkScoped,
      )
      yield* Effect.yieldNow
      for (const listener of listeners) listener()
      // An exchange still works beside the notices.
      const result = yield* transport.exchange(0, [])
      return { heard: yield* Fiber.join(heard), result }
    })
    const outcome = await Effect.runPromise(
      Effect.scoped(
        program.pipe(Effect.provide(layerSocket({ url: 'ws://test', makeSocket: () => client }))),
      ),
    )
    expect(outcome).toEqual({ heard: [undefined], result: { operations: [], rejected: [] } })
    stop()
    expect(listeners.size).toBe(0)
  })

  it('hears a reconnect as a change, since it may have missed notices', async () => {
    let sockets = 0
    const closes = new Set<() => void>()
    const makeSocket = (): SocketLike => {
      sockets += 1
      return {
        send: () => {},
        close: () => {},
        onMessage: () => () => {},
        onClose: listener => {
          closes.add(listener)
          return () => closes.delete(listener)
        },
      }
    }
    const program = Effect.gen(function* () {
      const transport = yield* Effect.service(Transport)
      const heard = yield* transport.changes!.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkScoped,
      )
      yield* Effect.yieldNow
      for (const close of [...closes]) close()
      return yield* Fiber.join(heard)
    })
    const heard = await Effect.runPromise(
      Effect.scoped(
        program.pipe(
          Effect.provide(layerSocket({ url: 'ws://test', makeSocket, retryBase: '1 millis' })),
        ),
      ),
    )
    expect(heard).toEqual([undefined])
    expect(sockets).toBe(2)
  })

  it('shares its connection, across a reconnect, with another protocol', async () => {
    const servers: Array<SocketLike> = []
    const clients: Array<SocketLike> = []
    const makeSocket = (): SocketLike => {
      const { client, server } = socketPair()
      const closes = new Set<() => void>()
      servers.push(server)
      const closing: SocketLike = {
        ...client,
        close: () => {
          for (const listener of [...closes]) listener()
        },
        onClose: listener => {
          closes.add(listener)
          return () => closes.delete(listener)
        },
      }
      clients.push(closing)
      return closing
    }
    const program = Effect.gen(function* () {
      const transport = yield* Effect.service(Transport)
      const socket = transport.socket!
      const heard: Array<string> = []
      socket.onMessage(data => heard.push(data))
      const received: Array<string> = []
      while (servers.length < 1) yield* Effect.sleep('1 millis')
      servers[0]!.onMessage(data => received.push(data))
      socket.send('one')
      servers[0]!.send('from the first')
      clients[0]!.close()
      while (servers.length < 2) yield* Effect.sleep('1 millis')
      servers[1]!.onMessage(data => received.push(`second: ${data}`))
      socket.send('two')
      servers[1]!.send('from the second')
      return { heard, received }
    })
    const result = await Effect.runPromise(
      Effect.scoped(
        program.pipe(
          Effect.provide(layerSocket({ url: 'ws://test', makeSocket, retryBase: '1 millis' })),
        ),
      ),
    )
    expect(result).toEqual({
      heard: ['from the first', 'from the second'],
      received: ['one', 'second: two'],
    })
  })

  it('drops a shared send while its socket is still connecting, as a WebSocket would throw', async () => {
    let open: (() => void) | undefined
    const sent: Array<string> = []
    const connecting: SocketLike = {
      send: data => {
        if (open !== undefined) throw new Error('InvalidStateError: still connecting')
        sent.push(data)
      },
      close: () => {},
      onOpen: listener => {
        open = listener
        return () => {}
      },
      onMessage: () => () => {},
      onClose: () => () => {},
    }
    const program = Effect.gen(function* () {
      const transport = yield* Effect.service(Transport)
      while (open === undefined) yield* Effect.sleep('1 millis')
      transport.socket!.send('early')
      const opened = open
      open = undefined
      opened()
      transport.socket!.send('late')
      return sent
    })
    const result = await Effect.runPromise(
      Effect.scoped(
        program.pipe(
          Effect.provide(layerSocket({ url: 'ws://test', makeSocket: () => connecting })),
        ),
      ),
    )
    expect(result).toEqual(['late'])
  })

  it('fails the exchange when the reply carries an error', async () => {
    const { client, server } = socketPair()
    server.onMessage(data => {
      const frame = JSON.parse(data) as { id: string }
      server.send(JSON.stringify({ id: frame.id, error: 'refused' }))
    })

    expect(await Effect.runPromise(withSocket(client))).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'SyncTransportError', message: 'refused' },
    })
  })

  it('correlates concurrent exchanges by frame id', async () => {
    const { client, server } = socketPair()
    const frames: Array<{ id: string }> = []
    server.onMessage(data => {
      const frame = JSON.parse(data) as { id: string }
      frames.push(frame)
      if (frames.length === 2) {
        // Reply in reverse order; the layer must match each id, not arrival.
        server.send(JSON.stringify({ id: frames[1]!.id, result: 'second' }))
        server.send(JSON.stringify({ id: frames[0]!.id, result: 'first' }))
      }
    })

    const program = Effect.gen(function* () {
      const transport = yield* Effect.service(Transport)
      return yield* Effect.all([transport.exchange(1, []), transport.exchange(2, [])], {
        concurrency: 'unbounded',
      })
    })

    expect(
      await Effect.runPromise(
        program.pipe(Effect.provide(layerSocket({ url: 'ws://test', makeSocket: () => client }))),
      ),
    ).toEqual(['first', 'second'])
  })

  it('answers the client when the far socket is served', async () => {
    const { client, server } = socketPair()
    serveSocket(server, { exchange: (cursor, pending) => ({ cursor, pending }) })

    expect(await Effect.runPromise(withSocket(client))).toMatchObject({
      _tag: 'Success',
      success: { cursor: 0, pending: [] },
    })
  })

  it('refuses a frame it cannot answer before the handler sees it', async () => {
    const { client, server } = socketPair()
    let exchanged = 0
    serveSocket(server, {
      exchange: () => {
        exchanged += 1
        return { operations: [], rejected: [] }
      },
    })

    client.send('not json')
    client.send(JSON.stringify({ id: 'x', cursor: 'nope', pending: [] }))
    client.send(JSON.stringify({ cursor: 0, pending: [] }))
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(exchanged).toBe(0)
  })

  it('returns a handler failure to the client as a transport error', async () => {
    const { client, server } = socketPair()
    serveSocket(server, {
      exchange: () => {
        throw new Error('handler down')
      },
    })

    expect(await Effect.runPromise(withSocket(client))).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'SyncTransportError', message: 'handler down' },
    })
  })

  it('does not leak an unhandled rejection when the reply cannot be sent', async () => {
    const { client, server } = socketPair()
    const refusing: SocketLike = {
      ...server,
      send: () => {
        throw new Error('socket closed')
      },
    }
    let exchanged = false
    serveSocket(refusing, {
      exchange: () => {
        exchanged = true
        return { operations: [], rejected: [] }
      },
    })

    const rejections: Array<unknown> = []
    const onRejection = (reason: unknown): void => {
      rejections.push(reason)
    }
    process.on('unhandledRejection', onRejection)
    try {
      client.send(JSON.stringify({ id: '1', cursor: 0, pending: [] }))
      await new Promise(resolve => setTimeout(resolve, 0))
    } finally {
      process.off('unhandledRejection', onRejection)
    }

    expect(exchanged).toBe(true)
    expect(rejections).toEqual([])
  })

  it('reconnects and re-sends an exchange after the socket closes', async () => {
    const serverMessages = new Set<(data: string) => void>()
    const replies = new Map<SocketLike, (data: string) => void>()
    let current: SocketLike | undefined
    let clients = 0
    const makeClient = (): SocketLike => {
      clients += 1
      const closes = new Set<() => void>()
      let closed = false
      const client: SocketLike = {
        send: data => {
          if (!closed) for (const listener of [...serverMessages]) listener(data)
        },
        close: () => {
          closed = true
          for (const listener of [...closes]) listener()
        },
        onMessage: listener => {
          const reply = (data: string): void => listener(data)
          replies.set(client, reply)
          return () => replies.delete(client)
        },
        onClose: listener => {
          closes.add(listener)
          return () => closes.delete(listener)
        },
      }
      current = client
      return client
    }
    serverMessages.add(data => {
      const frame = JSON.parse(data) as { id: string }
      replies.get(current!)?.(JSON.stringify({ id: frame.id, result: { ok: true } }))
    })

    const program = Effect.gen(function* () {
      const transport = yield* Effect.service(Transport)
      const first = yield* transport.exchange(0, [])
      current!.close()
      const second = yield* transport.exchange(1, [])
      return [first, second]
    })
    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(
          layerSocket({ url: 'ws://test', makeSocket: makeClient, retryBase: '1 millis' }),
        ),
      ),
    )

    expect(result).toEqual([{ ok: true }, { ok: true }])
    expect(clients).toBe(2)
  })

  it('fails queued work once reconnect attempts are exhausted', async () => {
    let created = 0
    const makeClosing = (): SocketLike => {
      created += 1
      const closes = new Set<() => void>()
      const fire = (): void => {
        for (const listener of [...closes]) listener()
      }
      return {
        send: fire,
        close: fire,
        onMessage: () => () => {},
        onClose: listener => {
          closes.add(listener)
          return () => closes.delete(listener)
        },
      }
    }

    const program = Effect.gen(function* () {
      const transport = yield* Effect.service(Transport)
      return yield* transport.exchange(0, [])
    }).pipe(Effect.result)
    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(
          layerSocket({
            url: 'ws://test',
            makeSocket: makeClosing,
            retryBase: '1 millis',
            maxRetries: 2,
          }),
        ),
      ),
    )

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'SyncTransportError', message: 'transport closed' },
    })
    expect(created).toBe(3)
  })

  it('fails a new exchange when the queue is full', async () => {
    const neverReplies: SocketLike = {
      send: () => {},
      close: () => {},
      onMessage: () => () => {},
      onClose: () => () => {},
    }
    const program = Effect.gen(function* () {
      const transport = yield* Effect.service(Transport)
      const held = yield* Effect.forkScoped(transport.exchange(0, []))
      yield* Effect.yieldNow
      const second = yield* Effect.result(transport.exchange(1, []))
      yield* Fiber.interrupt(held)
      return second
    })
    const result = await Effect.runPromise(
      Effect.scoped(
        program.pipe(
          Effect.provide(
            layerSocket({ url: 'ws://test', makeSocket: () => neverReplies, maxQueue: 1 }),
          ),
        ),
      ),
    )

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'SyncTransportError', message: 'transport queue full' },
    })
  })

  /**
   * A server that can be taken down: while down, a socket closes without
   * opening; while up, it opens and answers every frame. `withOpen: false` makes
   * sockets that report no `onOpen`, which count as open from the start.
   */
  const flakyServer = (withOpen: boolean) => {
    const state = { up: false, created: 0 }
    const makeSocket = (): SocketLike => {
      state.created += 1
      const closes = new Set<() => void>()
      const messages = new Set<(data: string) => void>()
      const up = state.up
      if (!up) {
        setTimeout(() => {
          for (const listener of [...closes]) listener()
        }, 0)
      }
      return {
        send: data => {
          if (!up) return
          const frame = JSON.parse(data) as { id: string }
          queueMicrotask(() => {
            for (const listener of [...messages])
              listener(JSON.stringify({ id: frame.id, result: { ok: true } }))
          })
        },
        close: () => {
          for (const listener of [...closes]) listener()
        },
        ...(withOpen
          ? {
              onOpen: (listener: () => void) => {
                if (up) listener()
                return () => {}
              },
            }
          : {}),
        onMessage: listener => {
          messages.add(listener)
          return () => messages.delete(listener)
        },
        onClose: listener => {
          closes.add(listener)
          return () => closes.delete(listener)
        },
      }
    }
    return { state, makeSocket }
  }

  it.each([
    ['that open', true],
    ['with no open event', false],
  ])(
    'fails fast while offline, and exchanges again once the server is back, for sockets %s',
    async (_, withOpen) => {
      const { state, makeSocket } = flakyServer(withOpen)
      const program = Effect.gen(function* () {
        const transport = yield* Effect.service(Transport)
        const queued = yield* Effect.result(transport.exchange(0, []))
        // Offline now: this fails at once rather than waiting on a socket.
        const offline = yield* Effect.result(transport.exchange(1, []))
        state.up = true
        const created = state.created
        // The reconnect loop is still running, and finds the server.
        let back: unknown
        while (back === undefined) {
          yield* Effect.sleep('2 millis')
          const attempt = yield* Effect.result(transport.exchange(2, []))
          if (attempt._tag === 'Success') back = attempt.success
        }
        return { queued, offline, back, reconnected: state.created > created }
      })
      const result = await Effect.runPromise(
        Effect.scoped(
          program.pipe(
            Effect.provide(
              layerSocket({
                url: 'ws://test',
                makeSocket,
                retryBase: '1 millis',
                maxRetryDelay: '2 millis',
                maxRetries: 1,
              }),
            ),
          ),
        ),
      )

      expect(result).toMatchObject({
        queued: { _tag: 'Failure', failure: { message: 'transport closed' } },
        offline: { _tag: 'Failure', failure: { message: 'transport closed' } },
        back: { ok: true },
        reconnected: true,
      })
    },
  )

  it('counts only consecutive failures toward giving up queued work', async () => {
    // Every socket answers one frame, then drops the connection on the next, so
    // each exchange after the first costs one reconnect. With a budget of one
    // retry, a lifetime count would give up on the second.
    const makeSocket = (): SocketLike => {
      const closes = new Set<() => void>()
      const messages = new Set<(data: string) => void>()
      let answered = false
      return {
        send: data => {
          if (answered) {
            for (const listener of [...closes]) listener()
            return
          }
          answered = true
          const frame = JSON.parse(data) as { id: string }
          queueMicrotask(() => {
            for (const listener of [...messages])
              listener(JSON.stringify({ id: frame.id, result: { ok: true } }))
          })
        },
        close: () => {},
        onOpen: listener => {
          listener()
          return () => {}
        },
        onMessage: listener => {
          messages.add(listener)
          return () => messages.delete(listener)
        },
        onClose: listener => {
          closes.add(listener)
          return () => closes.delete(listener)
        },
      }
    }
    const program = Effect.gen(function* () {
      const transport = yield* Effect.service(Transport)
      const results: Array<unknown> = []
      for (let round = 0; round < 4; round++) results.push(yield* transport.exchange(round, []))
      return results
    })
    const result = await Effect.runPromise(
      Effect.scoped(
        program.pipe(
          Effect.provide(
            layerSocket({ url: 'ws://test', makeSocket, retryBase: '1 millis', maxRetries: 1 }),
          ),
        ),
      ),
    )

    expect(result).toEqual([{ ok: true }, { ok: true }, { ok: true }, { ok: true }])
  })

  it('ignores a late reply and frees the slot of an interrupted exchange', async () => {
    const { client, server } = socketPair()
    const frames: Array<{ id: string }> = []
    server.onMessage(data => frames.push(JSON.parse(data) as { id: string }))

    const program = Effect.gen(function* () {
      const transport = yield* Effect.service(Transport)
      const held = yield* Effect.forkScoped(transport.exchange(0, []))
      yield* Effect.yieldNow
      expect(frames).toHaveLength(1)
      const interrupted = frames[0]!.id
      yield* Fiber.interrupt(held)

      // The interrupted exchange released its slot, so a second is accepted.
      const second = yield* Effect.forkScoped(Effect.result(transport.exchange(1, [])))
      yield* Effect.yieldNow
      expect(frames).toHaveLength(2)
      const secondId = frames[1]!.id

      // A reply for the interrupted frame must not resolve the second exchange.
      server.send(JSON.stringify({ id: interrupted, result: 'late' }))
      yield* Effect.yieldNow

      server.send(JSON.stringify({ id: secondId, result: 'ok' }))
      const joined = yield* Fiber.join(second)
      expect(joined).toMatchObject({ _tag: 'Success' })
      expect(JSON.stringify(joined)).toContain('ok')
      expect(JSON.stringify(joined)).not.toContain('late')
    })

    await Effect.runPromise(
      Effect.scoped(
        program.pipe(
          Effect.provide(layerSocket({ url: 'ws://test', makeSocket: () => client, maxQueue: 1 })),
        ),
      ),
    )
  })
})

describe('the default socket', () => {
  it('removes the close listener it registers', () => {
    class FakeSocket {
      static readonly OPEN = 1
      static readonly instances: FakeSocket[] = []
      readyState = 0
      private readonly listeners = new Map<string, Set<(event: unknown) => void>>()
      constructor() {
        FakeSocket.instances.push(this)
      }
      addEventListener(type: string, listener: (event: unknown) => void): void {
        const set = this.listeners.get(type) ?? new Set()
        set.add(listener)
        this.listeners.set(type, set)
      }
      removeEventListener(type: string, listener: (event: unknown) => void): void {
        this.listeners.get(type)?.delete(listener)
      }
      emit(type: string): void {
        for (const listener of [...(this.listeners.get(type) ?? [])]) listener({})
      }
      send(): void {}
      close(): void {}
    }

    vi.stubGlobal('WebSocket', FakeSocket)
    try {
      const socket = nativeSocket('ws://test')
      const instance = FakeSocket.instances[0]!
      const listener = vi.fn()
      const off = socket.onClose(listener)

      instance.emit('close')
      expect(listener).toHaveBeenCalledTimes(1)

      off()
      instance.emit('close')
      expect(listener).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

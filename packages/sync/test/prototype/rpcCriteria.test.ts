/**
 * The acceptance criteria of `effect-reuse-sync-durable-DESIGN.md` §14.3, run
 * against Sync's own transports and against the Effect RPC prototype
 * (`effectRpc.ts`), so a criterion the prototype meets is shown to be one the
 * current transport meets too. In process (the loopback, the socket transport
 * over a socket pair, `RpcTest.makeClient`) and over real WebSockets on
 * localhost (Node's global `WebSocket`, the browser's API, against a `ws`
 * server), where reconnects and frames are real.
 */
import { Cause, Effect, Exit, Fiber, Layer, Schedule, Schema, Scope, Stream } from 'effect'
import { HttpEffect } from 'effect/http'
import { RpcClient, RpcSerialization, RpcServer, RpcTest } from 'effect/rpc'
import { Socket } from 'effect/socket'
import { DocumentId } from 'foldkit-durable'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer, type WebSocket as WsSocket } from 'ws'
import {
  layerLoopback,
  layerSocket,
  sequence,
  serveSocket,
  Transport,
  TransportError,
  type SocketLike,
} from '../../src/index.js'
import { journalChanges, journalExchange } from '../../src/journal.js'
import { closeScopes, Message, openJournal, pendingOf, replica, Todos } from '../fixtures/todos.js'
import { socketPair } from '../sockets.js'
import {
  ExchangePayload,
  fromClient,
  handlers,
  layerRpc,
  serveRpcSocket,
  SyncRpcs,
  type ServeOptions,
} from './effectRpc.js'

afterEach(() => {
  closeScopes()
})

type Journal = ReturnType<typeof openJournal>

/** The server's side, as `serveJournal` composes it, for any transport to serve. */
const serving = (
  journal: Journal,
  options: { readonly opens?: Effect.Effect<boolean> } = {},
): ServeOptions => {
  const client = journalExchange({ sync: Todos, journal, principal: 'ada', ...options })
  return {
    exchange: (cursor, pending, epoch) => client.exchange(sequence(cursor), pending, epoch),
    changes: journalChanges(journal, Todos.documentId),
  }
}

interface Subject {
  readonly name: string
  readonly layer: (serve: ServeOptions) => Layer.Layer<Transport, TransportError>
  /** Whether it carries the server's notices. */
  readonly hearsChanges: boolean
  /**
   * How a malformed frame is refused before the exchange sees it: by the
   * server, as a failure; or by the client, as a defect; or not at all.
   */
  readonly refusesFrames: 'failure' | 'defect' | 'no'
}

const inProcess: ReadonlyArray<Subject> = [
  {
    name: 'loopback (current)',
    layer: serve => layerLoopback(serve.exchange),
    hearsChanges: false,
    refusesFrames: 'no',
  },
  {
    name: 'socket over a socket pair (current)',
    layer: serve =>
      layerSocket({
        makeSocket: () => {
          const { client, server } = socketPair()
          serveSocket(server, serve)
          return client
        },
      }),
    hearsChanges: true,
    refusesFrames: 'failure',
  },
  {
    name: 'RPC in memory (RpcTest)',
    layer: serve =>
      Layer.effect(
        Transport,
        Effect.map(RpcTest.makeClient(SyncRpcs), client => Transport.of(fromClient(client))),
      ).pipe(Layer.provide(handlers(serve))),
    hearsChanges: true,
    // The client checks the payload as it builds the request, and throws.
    refusesFrames: 'defect',
  },
]

/** A `ws` socket as Sync's `SocketLike`. */
const wsSocket = (ws: WsSocket): SocketLike => ({
  send: data => ws.send(data),
  close: () => ws.close(),
  onMessage: listener => {
    const handler = (data: unknown): void => listener(String(data))
    ws.on('message', handler)
    return () => void ws.off('message', handler)
  },
  onClose: listener => {
    ws.on('close', listener)
    return () => void ws.off('close', listener)
  },
})

interface Wire {
  readonly name: string
  /** Serves one accepted socket; returns the stop. */
  readonly serve: (ws: WsSocket, serve: ServeOptions) => () => void
  readonly layer: (url: string) => Layer.Layer<Transport, TransportError>
  /** Whether one `synchronize` outlasts a reply lost to a dropped socket. */
  readonly resendsItself: boolean
}

const quick = '20 millis'

const wires: ReadonlyArray<Wire> = [
  {
    name: 'socket transport over a WebSocket (current)',
    serve: (ws, serve) => serveSocket(wsSocket(ws), serve),
    layer: url => layerSocket({ url, retryBase: '10 millis', maxRetryDelay: '50 millis' }),
    // It sends an unanswered frame again on the next connection, unasked.
    resendsItself: true,
  },
  {
    name: 'RPC over a WebSocket',
    serve: (ws, serve) => {
      const fiber = Effect.runFork(
        Effect.scoped(
          Effect.flatMap(Socket.fromWebSocket(Effect.succeed(ws)), socket =>
            serveRpcSocket(socket, serve),
          ),
        ),
      )
      return () => void Effect.runFork(Fiber.interrupt(fiber))
    },
    layer: url =>
      layerRpc({ resubscribe: quick }).pipe(
        Layer.provide(
          RpcClient.layerProtocolSocket({
            retryTransientErrors: true,
            retryPolicy: Schedule.spaced(quick),
          }),
        ),
        Layer.provide(Socket.layerWebSocket(url)),
        Layer.provide(Socket.layerWebSocketConstructorGlobal),
        Layer.provide(RpcSerialization.layerJson),
      ),
    // A dropped connection fails the call, and a call fails fast until the
    // socket is back; the replica's next exchange sends it again.
    resendsItself: false,
  },
]

interface Server {
  readonly url: string
  /** Drops every open connection, as a network does. */
  readonly drop: () => void
  readonly close: () => Promise<void>
}

const listen = async (wire: Wire, serve: ServeOptions): Promise<Server> => {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  await new Promise<void>(resolve => server.once('listening', resolve))
  server.on('connection', ws => {
    const stop = wire.serve(ws, serve)
    ws.on('close', stop)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Expected a TCP address')
  return {
    url: `ws://127.0.0.1:${address.port}`,
    drop: () => {
      for (const client of server.clients) client.terminate()
    },
    close: () =>
      new Promise(resolve => {
        for (const client of server.clients) client.terminate()
        server.close(() => resolve())
      }),
  }
}

/** Runs `effect` with the transport built in a scope of its own, closed after. */
const using = async <A, E>(
  layer: Layer.Layer<Transport, TransportError>,
  effect: Effect.Effect<A, E, Transport>,
): Promise<A> => {
  const scope = Effect.runSync(Scope.make())
  try {
    const context = await Effect.runPromise(Layer.buildWithScope(layer, scope))
    return await Effect.runPromise(Effect.provide(effect, context))
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }
}

/** One exchange through the transport, its result or its failure. */
const exchange = (cursor: number, pending: ReadonlyArray<unknown>, epoch?: string) =>
  Effect.flatMap(Effect.service(Transport), transport =>
    Effect.result(transport.exchange(cursor, pending, epoch)),
  )

/** Two replicas converge through the transport: what one writes, the other reads. */
const converges = async (layer: Layer.Layer<Transport, TransportError>) => {
  const writer = await replica('a')
  const reader = await replica('b')
  await Effect.runPromise(writer.submit(Message.CreatedTodo({ id: 't1', title: 'Milk' })))
  await using(
    layer,
    Effect.gen(function* () {
      yield* writer.synchronize
      yield* reader.synchronize
    }),
  )
  return {
    pending: Effect.runSync(writer.status).pending,
    read: Effect.runSync(reader.shared).todos,
  }
}

describe.each(inProcess)('$name', subject => {
  it('is a Layer of the one seam: two replicas converge through it', async () => {
    expect(await converges(subject.layer(serving(openJournal())))).toEqual({
      pending: 0,
      read: [{ id: 't1', title: 'Milk' }],
    })
  })

  it('carries an operation the server refuses by its id, and commits the one behind it', async () => {
    const [first, second] = await pendingOf('a', ['Milk', 'Eggs'])
    const tampered = { ...first!, message: { _tag: 'CreatedTodo', id: 'a0', title: '' } }
    const reply = await using(
      subject.layer(serving(openJournal())),
      exchange(0, [tampered, second!]),
    )
    expect(reply).toMatchObject({
      _tag: 'Success',
      success: { rejected: [first!.opId], acknowledged: [second!.opId] },
    })
  })

  it('fails with the server’s words when it refuses the connection', async () => {
    const reply = await using(
      subject.layer(serving(openJournal(), { opens: Effect.succeed(false) })),
      exchange(0, []),
    )
    expect(reply).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'SyncTransportError', message: 'This connection may not open the document' },
    })
  })

  it('sends the epoch the replica last saw, and none before it saw one', async () => {
    const seen: Array<string | undefined> = []
    const layer = subject.layer({
      exchange: (_, __, epoch) => {
        seen.push(epoch)
        return { operations: [], rejected: [], epoch: 'e1' }
      },
    })
    const writer = await replica('a')
    await using(layer, Effect.andThen(writer.synchronize, writer.synchronize))
    expect(seen).toEqual([undefined, 'e1'])
  })

  it('refuses a negative cursor before the exchange, or does not', async () => {
    const asked: Array<number> = []
    const exit = await using(
      subject.layer({ exchange: cursor => (asked.push(cursor), { operations: [], rejected: [] }) }),
      Effect.exit(
        Effect.flatMap(Effect.service(Transport), transport => transport.exchange(-1, [])),
      ),
    )
    const refused = Exit.match(exit, {
      onSuccess: () => 'no',
      onFailure: cause => (Cause.hasDies(cause) ? 'defect' : 'failure'),
    })
    expect({ refused, asked }).toEqual({
      refused: subject.refusesFrames,
      asked: subject.refusesFrames === 'no' ? [-1] : [],
    })
  })

  it.runIf(subject.hearsChanges)('wakes on another replica’s commit', async () => {
    const journal = openJournal()
    const serve = serving(journal)
    const [operation] = await pendingOf('b', ['Milk'])
    const notices = await using(
      subject.layer(serve),
      Effect.gen(function* () {
        const transport = yield* Transport
        let heard = 0
        yield* Effect.forkChild(
          Stream.runForEach(transport.changes!, () => Effect.sync(() => (heard += 1))),
          { startImmediately: true },
        )
        // What a (re)connection announces lands first; only a notice after the commit counts.
        yield* Effect.sleep('50 millis')
        const before = heard
        yield* Effect.promise(async () => serve.exchange(0, [operation!]))
        yield* Effect.sleep('10 millis').pipe(
          Effect.repeat({ until: () => heard > before, times: 100 }),
        )
        return heard - before
      }),
    )
    expect(notices).toBe(1)
  })
})

describe('the wire', () => {
  it('carries every field of the frame the socket transport writes, with the same types', async () => {
    const frames: Array<unknown> = []
    const [operation] = await pendingOf('a', ['Milk'])
    await using(
      layerSocket({
        makeSocket: () => {
          const { client, server } = socketPair()
          server.onMessage(data => {
            const { id, ...frame } = JSON.parse(data) as { id: string }
            frames.push(frame)
            server.send(JSON.stringify({ id, result: { operations: [], rejected: [] } }))
          })
          return client
        },
      }),
      Effect.andThen(exchange(0, []), exchange(3, [operation!], 'e1')),
    )
    const strict = Schema.decodeUnknownSync(ExchangePayload, { onExcessProperty: 'error' })
    expect(frames.map(frame => strict(frame))).toEqual(frames)
    expect(frames).toHaveLength(2)
  })

  // Effect's behaviour, pinned: a Request's own headers are concatenated after
  // the connection's (`RpcServer.js:875`, and `:1153` for a WebSocket upgrade),
  // and `Headers.fromInput` keeps the last, so the client's win.
  it('lets a request’s headers override the connection’s', async () => {
    const origins: Array<string | undefined> = []
    const handler = await Effect.runPromise(
      Effect.gen(function* () {
        const scope = yield* Scope.make()
        const http = yield* RpcServer.toHttpEffect(SyncRpcs).pipe(
          Effect.provide(
            Layer.mergeAll(
              RpcSerialization.layerJson,
              SyncRpcs.toLayer({
                Exchange: (_, { headers }) =>
                  Effect.sync(
                    () => (origins.push(headers.origin), { operations: [], rejected: [] }),
                  ),
                Changes: () => Stream.empty,
              }),
            ),
          ),
          Scope.provide(scope),
        )
        return HttpEffect.toWebHandler(http)
      }),
    )
    await handler(
      new Request('http://localhost/rpc', {
        method: 'POST',
        headers: { origin: 'https://elsewhere.example', 'content-type': 'application/json' },
        body: JSON.stringify({
          _tag: 'Request',
          id: '1',
          tag: 'Exchange',
          payload: { cursor: 0, pending: [] },
          headers: [['origin', 'https://app.example']],
        }),
      }),
    )
    expect(origins).toEqual(['https://app.example'])
  })
})

describe.each(wires)('$name', wire => {
  const servers: Array<Server> = []
  afterEach(async () => {
    for (const server of servers.splice(0)) await server.close()
  })
  const start = async (serve: ServeOptions) => {
    const server = await listen(wire, serve)
    servers.push(server)
    return server
  }

  it('is a Layer of the one seam over the browser’s WebSocket API', async () => {
    const server = await start(serving(openJournal()))
    expect(await converges(wire.layer(server.url))).toEqual({
      pending: 0,
      read: [{ id: 't1', title: 'Milk' }],
    })
  })

  it('commits an operation once when its reply is lost to a dropped socket', async () => {
    const journal = openJournal()
    const serve = serving(journal)
    let calls = 0
    let server: Server | undefined
    server = await start({
      ...serve,
      exchange: async (cursor, pending, epoch) => {
        const reply = await serve.exchange(cursor, pending, epoch)
        calls += 1
        // Committed, then the connection goes before the reply can.
        if (calls === 1) server!.drop()
        return reply
      },
    })
    const writer = await replica('a')
    await Effect.runPromise(writer.submit(Message.CreatedTodo({ id: 't1', title: 'Milk' })))
    let attempts = 0
    await using(
      wire.layer(server.url),
      Effect.suspend(() => ((attempts += 1), writer.synchronize)).pipe(
        Effect.retry({ schedule: Schedule.spaced(quick), times: 100 }),
      ),
    )
    const reader = await replica('b')
    await using(wire.layer(server.url), reader.synchronize)
    expect({
      once: attempts === 1,
      exchangedAgain: calls >= 2,
      pending: Effect.runSync(writer.status).pending,
      read: Effect.runSync(reader.shared).todos,
      committed: Effect.runSync(journal.cursor(DocumentId.make(Todos.documentId))),
    }).toEqual({
      once: wire.resendsItself,
      exchangedAgain: true,
      pending: 0,
      read: [{ id: 't1', title: 'Milk' }],
      committed: 1,
    })
  })

  it('hears another replica’s commit after reconnecting', async () => {
    const journal = openJournal()
    const serve = serving(journal)
    const server = await start(serve)
    const [operation] = await pendingOf('b', ['Milk'])
    const notices = await using(
      wire.layer(server.url),
      Effect.gen(function* () {
        const transport = yield* Transport
        const heard = yield* Effect.forkChild(Stream.runCount(Stream.take(transport.changes!, 3)), {
          startImmediately: true,
        })
        // Opened; then dropped, and opened again: a notice each time; then the commit.
        yield* exchange(0, [])
        server.drop()
        yield* transport
          .exchange(0, [])
          .pipe(Effect.retry({ schedule: Schedule.spaced(quick), times: 100 }))
        yield* Effect.promise(async () => serve.exchange(0, [operation!]))
        return yield* Fiber.join(heard)
      }),
    )
    expect(notices).toBe(3)
  })
})

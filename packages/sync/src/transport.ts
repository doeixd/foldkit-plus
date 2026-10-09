import { Clock, Context, Duration, Effect, Layer, PubSub, Schema, Stream } from 'effect'
import { sequence } from './ids.js'
import type { Operation, TransportClient } from './sync.js'

/** The wire failure of a transport. A refusal is a result, not an error. */
export class TransportError extends Schema.TaggedError<TransportError>()('SyncTransportError', {
  message: Schema.String,
}) {}

/** One request/response frame, as it crosses a wire. */
export interface ExchangeFrame {
  readonly id: string
  readonly cursor: number
  readonly pending: ReadonlyArray<Operation>
  readonly epoch?: string | undefined
}

export interface ExchangeReply {
  readonly id: string
  readonly result?: unknown
  readonly error?: string
}

/**
 * Sent by a server, unasked, when the document may have changed. It carries no
 * data: the replica exchanges from its own cursor, so a notice that is lost,
 * late, or one of many is harmless.
 */
export interface NotifyFrame {
  readonly notify: true
}

export interface TransportShape {
  /** `epoch` is the server history the replica's cursor points into, when it knows one. */
  readonly exchange: (
    cursor: number,
    pending: ReadonlyArray<Operation>,
    epoch?: string | undefined,
  ) => Effect.Effect<unknown, TransportError>
  /**
   * Emits when the server may have something new, for a transport that can hear
   * it: `Replica.start` exchanges on each. A wake-up, not data.
   */
  readonly changes?: Stream.Stream<void> | undefined
  /**
   * The connection itself, for another protocol to share, such as presence: a send goes to
   * the socket open now and is dropped while none is, and messages from every socket the
   * transport opens arrive here. It is the transport's to close.
   */
  readonly socket?: SocketLike | undefined
}

/**
 * The seam the replica syncs through.
 *
 * A service, not a concrete client, so an application substitutes an in-process
 * transport, a socket, or a test double without the replica knowing. A refusal
 * arrives in the exchange result; only a wire failure is a `TransportError`.
 */
export class Transport extends Context.Service<Transport, TransportShape>()(
  'foldkit-sync/Transport',
) {}

const failure = (error: unknown): TransportError =>
  new TransportError({ message: error instanceof Error ? error.message : String(error) })

/** A transport backed by an in-process handler, for tests and single-process demos. */
export const layerLoopback = (
  handler: (
    cursor: number,
    pending: ReadonlyArray<Operation>,
    epoch?: string | undefined,
  ) => unknown | Promise<unknown>,
): Layer.Layer<Transport> =>
  Layer.succeed(Transport, {
    exchange: (cursor, pending, epoch) =>
      Effect.tryPromise({
        try: () => Promise.resolve(handler(cursor, pending, epoch)),
        catch: failure,
      }),
  })

/** Wraps the promise-based client the replica already speaks. */
export const layerFromPromise = (transport: TransportClient): Layer.Layer<Transport> =>
  Layer.succeed(Transport, {
    exchange: (cursor, pending, epoch) =>
      Effect.tryPromise({
        try: () => transport.exchange(sequence(cursor), pending, epoch),
        catch: failure,
      }),
  })

/** Bridges the service back to the promise client the replica consumes. */
export const toPromise = (transport: TransportShape): TransportClient => ({
  exchange: (cursor, pending, epoch) =>
    Effect.runPromise(transport.exchange(cursor, pending, epoch)),
})

/**
 * Serves one accepted socket, answering each exchange frame.
 *
 * The counterpart to `layerSocket`: the handler returns the exchange result, or
 * throws and the failure is written back as an error frame. With `changes`, a
 * subscription to the document's commits, the socket is also sent a
 * `NotifyFrame` after each, so a client hears of others' edits without polling.
 * Returns a function that stops serving.
 */
export const serveSocket = (
  socket: SocketLike,
  options: {
    readonly exchange: (
      cursor: number,
      pending: ReadonlyArray<Operation>,
      epoch?: string | undefined,
    ) => unknown | Promise<unknown>
    /** Subscribes to the document's commits; returns the unsubscribe. */
    readonly changes?: ((listener: () => void) => () => void) | undefined
  },
): (() => void) => {
  const send = (reply: ExchangeReply | NotifyFrame): void => {
    try {
      socket.send(JSON.stringify(reply))
    } catch {
      // The socket may have closed while the handler was running.
    }
  }
  const stopMessage = socket.onMessage(data => {
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      return
    }
    if (typeof parsed !== 'object' || parsed === null) return
    const { id, cursor, pending, epoch } = parsed as {
      id?: unknown
      cursor?: unknown
      pending?: unknown
      epoch?: unknown
    }
    // Without an id there is nobody to answer, so drop the frame.
    if (typeof id !== 'string') return
    if (
      typeof cursor !== 'number' ||
      !Number.isSafeInteger(cursor) ||
      cursor < 0 ||
      !Array.isArray(pending) ||
      (epoch !== undefined && typeof epoch !== 'string')
    ) {
      send({ id, error: 'Invalid exchange frame' })
      return
    }
    const frame: ExchangeFrame = {
      id,
      cursor,
      pending: pending as ReadonlyArray<Operation>,
      epoch: typeof epoch === 'string' ? epoch : undefined,
    }
    void (async () => {
      try {
        const result = await options.exchange(frame.cursor, frame.pending, frame.epoch)
        send({ id: frame.id, result })
      } catch (error) {
        send({ id: frame.id, error: error instanceof Error ? error.message : String(error) })
      }
    })()
  })
  const stopChanges = options.changes?.(() => send({ notify: true }))
  const stop = (): void => {
    stopMessage()
    stopChanges?.()
  }
  const stopClose = socket.onClose(stop)
  return () => {
    stop()
    stopClose()
  }
}

/** The minimal socket the layer needs; the global `WebSocket` satisfies it. */
export interface SocketLike {
  send(data: string): void
  close(): void
  onMessage(listener: (data: string) => void): () => void
  onClose(listener: () => void): () => void
  /**
   * Optional. When provided, exchanges wait for it before sending, so a
   * transport can connect asynchronously. Absent means already connected.
   */
  onOpen?(listener: () => void): () => void
}

/**
 * Where `layerSocket` connects: a `url` for the platform `WebSocket`, or a
 * `makeSocket` that opens any other `SocketLike` (a port, a test socket), called
 * again on every reconnect.
 */
export type SocketOptions = SocketTuning &
  (
    | { readonly url: string; readonly makeSocket?: undefined }
    | { readonly makeSocket: () => SocketLike; readonly url?: undefined }
  )

interface SocketTuning {
  /**
   * Consecutive failed connections after which queued work fails and new
   * exchanges fail fast until a connection is healthy again. Reconnecting goes
   * on regardless. Default 5.
   */
  readonly maxRetries?: number | undefined
  /** Base delay of the exponential reconnect backoff. Default `50 millis`. */
  readonly retryBase?: Duration.Input | undefined
  /** Longest wait between reconnect attempts. Default `5 seconds`. */
  readonly maxRetryDelay?: Duration.Input | undefined
  /** Exchanges queued or in flight before new ones fail. Default 64. */
  readonly maxQueue?: number | undefined
}

/** The default socket factory: the platform `WebSocket`, as a `SocketLike`. */
export const nativeSocket = (url: string): SocketLike => {
  const socket = new WebSocket(url)
  return {
    send: data => socket.send(data),
    close: () => socket.close(),
    onOpen: listener => {
      if (socket.readyState === WebSocket.OPEN) {
        listener()
        return () => {}
      }
      socket.addEventListener('open', listener)
      return () => socket.removeEventListener('open', listener)
    },
    onMessage: listener => {
      const handler = (event: MessageEvent): void => listener(String(event.data))
      socket.addEventListener('message', handler)
      return () => socket.removeEventListener('message', handler)
    },
    onClose: listener => {
      const handler = (): void => listener()
      socket.addEventListener('close', handler)
      return () => socket.removeEventListener('close', handler)
    },
  }
}

/**
 * A socket over a `MessagePort`, for either end: its frames are the port's
 * string messages, and anything else on the port is ignored. A port tells
 * neither end when the other goes, so `onClose` fires once, on `close()` or
 * when `signal` aborts; a host that serves a pane aborts it when the pane is
 * gone, which stops `serveSocket` and anything else listening.
 */
export const portSocket = (
  port: MessagePort,
  options: { readonly signal?: AbortSignal | undefined } = {},
): SocketLike => {
  const closeListeners = new Set<() => void>()
  let closed = false
  const close = (): void => {
    closed = true
    port.close()
    for (const listener of [...closeListeners]) listener()
    closeListeners.clear()
  }
  options.signal?.addEventListener('abort', close, { once: true })
  if (options.signal?.aborted === true) close()
  port.start()
  return {
    send: data => port.postMessage(data),
    close,
    onMessage: listener => {
      const handler = (event: MessageEvent): void => {
        if (typeof event.data === 'string') listener(event.data)
      }
      port.addEventListener('message', handler)
      return () => port.removeEventListener('message', handler)
    },
    onClose: listener => {
      if (closed) {
        listener()
        return () => {}
      }
      closeListeners.add(listener)
      return () => closeListeners.delete(listener)
    },
  }
}

/**
 * A socket over an existing `WebSocket`: the accepted end of a Cloudflare
 * `WebSocketPair`, or any other socket the platform hands over. Unlike
 * `nativeSocket` it opens nothing — accept the pair first — and unlike
 * `portSocket` there is no signal: the socket closing, erroring, or being
 * closed fires `onClose` once, which is how a host stops serving it.
 */
export const workerSocket = (socket: WebSocket): SocketLike => {
  const messageListeners = new Set<(data: string) => void>()
  const closeListeners = new Set<() => void>()
  let closed = false
  const forget = (): void => {
    socket.removeEventListener('message', onMessageEvent)
    socket.removeEventListener('close', onClosedEvent)
    socket.removeEventListener('error', onClosedEvent)
  }
  const fireClose = (): void => {
    closed = true
    forget()
    for (const listener of [...closeListeners]) listener()
    closeListeners.clear()
  }
  const onMessageEvent = (event: MessageEvent): void => {
    for (const listener of [...messageListeners]) listener(String(event.data))
  }
  const onClosedEvent = (): void => {
    fireClose()
  }
  socket.addEventListener('message', onMessageEvent)
  socket.addEventListener('close', onClosedEvent)
  socket.addEventListener('error', onClosedEvent)
  return {
    send: data => socket.send(data),
    close: () => {
      try {
        socket.close()
      } catch {
        // Already gone: still report the close.
      }
      fireClose()
    },
    onMessage: listener => {
      messageListeners.add(listener)
      return () => messageListeners.delete(listener)
    },
    onClose: listener => {
      if (closed) {
        listener()
        return () => {}
      }
      closeListeners.add(listener)
      return () => closeListeners.delete(listener)
    },
  }
}

const connector = (options: SocketOptions): (() => SocketLike) => {
  if (options.makeSocket !== undefined) return options.makeSocket
  const { url } = options
  return () => nativeSocket(url)
}

/**
 * A WebSocket client transport.
 *
 * One connection is live at a time. While it is connecting, exchanges queue; if
 * it closes, the transport reconnects on an exponential, jittered backoff and
 * re-sends every queued and in-flight frame with its original id, so a lost
 * reply is answered rather than dropped and a late reply cannot resolve a newer
 * frame. It never stops reconnecting: after `maxRetries` consecutive failures
 * queued work fails with a `TransportError`, and exchanges fail fast while no
 * socket is up, until a socket opens. The count resets only when a connection
 * proves healthy, by answering a frame or by staying open for `maxRetryDelay`:
 * a server that accepts a socket and drops it at once is backed off like one
 * that refuses it. A queue over `maxQueue` fails new
 * exchanges with backpressure. The socket is released when the layer's scope
 * ends.
 */
export const layerSocket = (options: SocketOptions): Layer.Layer<Transport, TransportError> =>
  Layer.effect(
    Transport,
    Effect.fn('Transport.layerSocket')(function* () {
      const makeSocket = connector(options)
      const maxQueue = options.maxQueue ?? 64
      const maxRetries = options.maxRetries ?? 5
      const retryBase = Duration.toMillis(
        Duration.fromInputUnsafe(options.retryBase ?? '50 millis'),
      )
      const maxRetryDelay = Duration.toMillis(
        Duration.fromInputUnsafe(options.maxRetryDelay ?? '5 seconds'),
      )
      const clock = yield* Clock.Clock

      interface Entry {
        readonly id: string
        readonly cursor: number
        readonly pending: ReadonlyArray<Operation>
        readonly epoch: string | undefined
        readonly resume: (effect: Effect.Effect<unknown, TransportError>) => void
      }
      const notices = yield* PubSub.sliding<void>(1)
      const listeners = new Set<(data: string) => void>()
      const shared: SocketLike = {
        send: data => {
          if (ready) socket?.send(data)
        },
        close: () => {},
        onMessage: listener => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        onClose: () => () => {},
      }
      const queued: Array<Entry> = []
      const inFlight = new Map<string, Entry>()
      let socket: SocketLike | undefined
      let ready = false
      let nextId = 0
      let disposed = false
      // Closes since a connection last proved healthy. Past `maxRetries` the
      // transport is offline: nothing waits for a socket that may be minutes away.
      let failures = 0
      const healthy = (): void => {
        failures = 0
      }

      const send = (entry: Entry): void => {
        inFlight.set(entry.id, entry)
        socket?.send(
          JSON.stringify({
            id: entry.id,
            cursor: entry.cursor,
            pending: entry.pending,
            ...(entry.epoch === undefined ? {} : { epoch: entry.epoch }),
          } satisfies ExchangeFrame),
        )
      }
      const flush = (): void => {
        if (socket === undefined || !ready) return
        for (const entry of queued.splice(0)) send(entry)
      }
      const requeue = (): void => {
        queued.unshift(...inFlight.values())
        inFlight.clear()
      }
      const failAll = (message: string): void => {
        const entries = [...queued.splice(0), ...inFlight.values()]
        inFlight.clear()
        for (const entry of entries) entry.resume(Effect.fail(new TransportError({ message })))
      }

      const connect = Effect.tryPromise({
        try: () =>
          new Promise<void>((resolve, reject) => {
            const next = makeSocket()
            socket = next
            ready = next.onOpen === undefined
            let openedAt = ready ? clock.currentTimeMillisUnsafe() : undefined
            // A socket that just (re)connected may have missed notices, so opening is one.
            const opened = (): void => {
              PubSub.publishUnsafe(notices, undefined)
            }
            const offOpen = next.onOpen?.(() => {
              ready = true
              openedAt = clock.currentTimeMillisUnsafe()
              opened()
              flush()
            })
            const offMessage = next.onMessage(data => {
              // Another protocol's listener must not cost an exchange its reply.
              for (const listener of [...listeners]) {
                try {
                  listener(data)
                } catch {}
              }
              let reply: ExchangeReply | NotifyFrame
              try {
                reply = JSON.parse(data) as ExchangeReply | NotifyFrame
              } catch {
                return
              }
              if (typeof reply !== 'object' || reply === null) return
              if ('notify' in reply) {
                if (reply.notify === true) PubSub.publishUnsafe(notices, undefined)
                return
              }
              const entry = inFlight.get(reply.id)
              if (entry === undefined) return
              healthy()
              inFlight.delete(reply.id)
              entry.resume(
                reply.error === undefined
                  ? Effect.succeed(reply.result)
                  : Effect.fail(new TransportError({ message: reply.error })),
              )
            })
            const offClose = next.onClose(() => {
              offOpen?.()
              offMessage()
              offClose()
              socket = undefined
              ready = false
              if (
                openedAt !== undefined &&
                clock.currentTimeMillisUnsafe() - openedAt >= maxRetryDelay
              )
                healthy()
              // Keep every unanswered frame for the next connection.
              requeue()
              reject(new Error('transport closed'))
            })
            if (ready) {
              opened()
              flush()
            }
          }),
        catch: () => new TransportError({ message: 'transport closed' }),
      })

      yield* Effect.forkScoped(
        Effect.gen(function* () {
          while (!disposed) {
            yield* Effect.exit(connect)
            if (disposed) return
            failures += 1
            if (failures > maxRetries) failAll('transport closed')
            const backoff = Math.min(maxRetryDelay, retryBase * 2 ** Math.min(failures - 1, 30))
            yield* Effect.sleep(backoff * (0.8 + Math.random() * 0.4))
          }
        }),
      )
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          disposed = true
          ready = false
          socket?.close()
          socket = undefined
          failAll('transport closed')
        }),
      )

      return Transport.of({
        changes: Stream.fromPubSub(notices),
        socket: shared,
        exchange: (cursor, pending, epoch) =>
          Effect.callback<unknown, TransportError>(resume => {
            if (disposed) {
              resume(Effect.fail(new TransportError({ message: 'transport closed' })))
              return
            }
            if (failures > maxRetries && !ready) {
              resume(Effect.fail(new TransportError({ message: 'transport closed' })))
              return
            }
            if (queued.length + inFlight.size >= maxQueue) {
              resume(Effect.fail(new TransportError({ message: 'transport queue full' })))
              return
            }
            const entry: Entry = { id: String(nextId++), cursor, pending, epoch, resume }
            if (ready) send(entry)
            else queued.push(entry)
            // A caller interrupted before a reply must release its slot, or a
            // socket that never replies can exhaust the queue with abandoned
            // work. The frame may already be on the wire; only the local waiter
            // is forgotten, and a late reply for it is ignored.
            return Effect.sync(() => {
              const queuedIndex = queued.indexOf(entry)
              if (queuedIndex >= 0) queued.splice(queuedIndex, 1)
              if (inFlight.get(entry.id) === entry) inFlight.delete(entry.id)
            })
          }),
      })
    })(),
  )

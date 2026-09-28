/**
 * A WebSocket as a bundle: connection lifecycle in the Model, full duplex
 * through one Managed Resource. The resource owns the socket; a `send`
 * helper writes through its tag service (lifted to the parent like every
 * helper); a subscription stream reads incoming messages through the same
 * tag. No hidden hub: everything the bundle touches is the Model, the
 * resource registry, or a Message.
 */
import { Effect, Option, Queue, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as ManagedResource from 'foldkit/managedResource'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { unlessSame } from '../internal.js'

/** The slice of a WebSocket the bundle needs; satisfied by the platform socket and test doubles. Handler events are `any`: the DOM and `ws` type them differently, and only `data` is read. */
export interface SocketHandle {
  readonly readyState: number
  send(data: string): void
  close(): void
  onopen: ((event: any) => void) | null
  onmessage: ((event: any) => void) | null
  onclose: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
}

export const WebSocketModel = Schema.Struct({
  url: Schema.String,
  status: Schema.Literals(['closed', 'connecting', 'open']),
  lastError: Schema.NullOr(Schema.String),
})
export type WebSocketModel = typeof WebSocketModel.Type

export const WebSocketMessage = defineMessageUnion({
  Connecting: {},
  Opened: {},
  /** Notifies without storing: project the payload into your own field to keep it. */
  Received: { data: Schema.String },
  Closed: {},
  Failed: { message: Schema.String },
  SendFailed: { message: Schema.String },
  /** Acknowledges dispatch of `data`, not its delivery; update ignores it. */
  Sent: { data: Schema.String },
  /** The socket was still connecting when `connectTimeoutMs` ran out, and was closed. */
  TimedOut: {},
})
export type WebSocketMessage = typeof WebSocketMessage.Type

/** The registry value behind the socket tag: the live socket and its incoming queue. */
export interface Acquired {
  readonly socket: SocketHandle
  readonly events: Queue.Queue<WebSocketMessage>
}

/** The live connection, for `send` and the incoming stream. One assembly holds one. */
export const Socket = ManagedResource.tag<Acquired>()('websocket')

/** The socket service a placed WebSocket's streams and send commands require. */
export type SocketService = ManagedResource.ServiceOf<typeof Socket>

type SocketResources = Readonly<{
  socket: ManagedResource.Entry<
    WebSocketModel,
    WebSocketMessage,
    Option.Option<string>,
    Acquired,
    SocketService,
    () => WebSocketMessage
  >
}>

type SendHelpers = Readonly<{
  send: (
    model: WebSocketModel,
    data: string,
  ) => Update.ReturnWithOutMessage<WebSocketModel, WebSocketMessage, never, SocketService>
}>

const textOf = (data: unknown): Effect.Effect<string> =>
  typeof data === 'string'
    ? Effect.succeed(data)
    : data instanceof Blob
      ? Effect.promise(() => data.text())
      : data instanceof ArrayBuffer || ArrayBuffer.isView(data)
        ? Effect.succeed(new TextDecoder().decode(data))
        : Effect.succeed(String(data))

/** Closes the socket with its handlers detached first, so the close reports nothing. */
const closeSilently = (socket: SocketHandle): void => {
  socket.onopen = null
  socket.onmessage = null
  socket.onclose = null
  socket.onerror = null
  socket.close()
}

const failMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const websocket = <const Name extends string>(config: {
  readonly name: Name
  /** Defaults to the platform WebSocket, read lazily so tests can substitute a double. */
  readonly createSocket?: ((url: string) => SocketHandle) | undefined
}) => {
  const createSocket: (url: string) => SocketHandle =
    config.createSocket ?? (url => new WebSocket(url) as unknown as SocketHandle)
  return Bundle.make<
    Name,
    WebSocketModel,
    WebSocketMessage,
    { readonly url: string; readonly connectTimeoutMs?: number | undefined },
    never,
    SocketService,
    SocketService,
    void,
    SocketResources,
    SendHelpers
  >(config.name, {
    Model: WebSocketModel,
    Message: WebSocketMessage,
    args: Schema.Struct({
      url: Schema.String,
      /** How long a socket may stay connecting before it is closed as `TimedOut`; unbounded when absent. */
      connectTimeoutMs: Schema.optional(
        Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0)), Schema.check(Schema.isFinite())),
      ),
    }),
    init: (args): Update.Return<WebSocketModel, WebSocketMessage, SocketService> => ({
      model: { url: args.url, status: 'closed', lastError: null },
    }),
    update: (
      model,
      message,
    ): Update.ReturnWithOutMessage<WebSocketModel, WebSocketMessage, never, SocketService> =>
      WebSocketMessage.match(message, {
        Connecting: () => ({ model: unlessSame(model, { ...model, status: 'connecting' }) }),
        Opened: () => ({
          model: unlessSame(model, { ...model, status: 'open', lastError: null }),
        }),
        Received: () => ({ model }),
        // The close that follows an error, and the release after it, find it closed.
        Closed: () => ({ model: unlessSame(model, { ...model, status: 'closed' }) }),
        Failed: ({ message }) => ({
          model: unlessSame(model, { ...model, status: 'closed', lastError: message }),
        }),
        SendFailed: ({ message }) => ({
          model: unlessSame(model, { ...model, lastError: message }),
        }),
        Sent: () => ({ model }),
        TimedOut: () => ({
          model: unlessSame(model, {
            ...model,
            status: 'closed',
            lastError: `websocket connect to ${model.url} timed out`,
          }),
        }),
      }),
    resources: () =>
      ManagedResource.make<WebSocketModel, WebSocketMessage>()(entry => ({
        socket: entry(Schema.Option(Schema.String), {
          resource: Socket,
          modelToMaybeRequirements: model => Option.some(model.url),
          acquire: (url: string) =>
            Effect.gen(function* () {
              const events = yield* Queue.unbounded<WebSocketMessage>()
              const socket = createSocket(url)
              // Offers run in arrival order: an async decode (Blob text) must
              // not overtake a later message. Rejections settle the chain
              // without breaking it; shutdown races are expected at teardown.
              let tail: Promise<void> = Promise.resolve()
              const enqueue = (effect: Effect.Effect<unknown>): void => {
                const run = () =>
                  Effect.runPromise(effect).then(
                    () => undefined,
                    () => undefined,
                  )
                tail = tail.then(run, run)
              }
              const offer = (message: WebSocketMessage) => enqueue(Queue.offer(events, message))
              socket.onopen = () => offer(WebSocketMessage.Opened())
              socket.onmessage = event => {
                enqueue(
                  Effect.flatMap(textOf(event.data), text =>
                    Queue.offer(events, WebSocketMessage.Received({ data: text })),
                  ),
                )
              }
              socket.onclose = () => offer(WebSocketMessage.Closed())
              socket.onerror = () =>
                offer(WebSocketMessage.Failed({ message: `websocket error for ${url}` }))
              return { socket, events }
            }),
          onAcquired: () => WebSocketMessage.Connecting(),
          onReleased: () => WebSocketMessage.Closed(),
          onAcquireError: error => WebSocketMessage.Failed({ message: failMessage(error) }),
          // Daemon teardown: close the socket and drain the queue.
          release: ({ socket, events }) =>
            Effect.asVoid(
              Effect.andThen(
                Effect.sync(() => closeSilently(socket)),
                Queue.shutdown(events),
              ),
            ),
        }),
      })),
    subscriptions: ({
      connectTimeoutMs,
    }): Subscription.Subscriptions<WebSocketModel, WebSocketMessage, SocketService> =>
      Subscription.make<WebSocketModel, WebSocketMessage, SocketService>()(entry => ({
        connectTimeout: entry(
          { connecting: Schema.Boolean },
          {
            modelToDependencies: model => ({ connecting: model.status === 'connecting' }),
            dependenciesToStream: ({ connecting }) =>
              !connecting || connectTimeoutMs === undefined
                ? Stream.empty
                : Stream.unwrap(
                    Effect.matchEffect(Effect.andThen(Effect.sleep(connectTimeoutMs), Socket.get), {
                      // Released while waiting: onReleased reports Closed.
                      onFailure: () => Effect.succeed(Stream.empty),
                      onSuccess: ({ socket }) =>
                        Effect.sync((): Stream.Stream<WebSocketMessage> => {
                          // 0 is WebSocket.CONNECTING. An open that beat the
                          // timer wins; the handlers go before the close, so
                          // the error and close it causes report nothing.
                          if (socket.readyState !== 0) return Stream.empty
                          closeSilently(socket)
                          return Stream.make(WebSocketMessage.TimedOut())
                        }),
                    }),
                  ),
          },
        ),
        incoming: entry(
          // Connecting to open is no reason to restart: the stream reads the
          // same queue, and replays an open it attached too late to see.
          { live: Schema.Boolean },
          {
            modelToDependencies: model => ({ live: model.status !== 'closed' }),
            dependenciesToStream: ({ live }) =>
              !live
                ? Stream.empty
                : Stream.unwrap(
                    Effect.matchEffect(Socket.get, {
                      // Released between the dependency read and attach: end
                      // quietly; onReleased reports Closed through update.
                      onFailure: () => Effect.succeed(Stream.empty),
                      onSuccess: ({ socket, events }) =>
                        Effect.succeed(
                          Stream.concat(
                            // A fast server opens before the stream attaches; without
                            // this the status would stick at connecting while
                            // messages flow. 1 is WebSocket.OPEN everywhere.
                            socket.readyState === 1
                              ? Stream.make(WebSocketMessage.Opened())
                              : Stream.empty,
                            Stream.fromQueue(events),
                          ),
                        ),
                    }),
                  ),
          },
        ),
      })),
    helpers: {
      send: (model, data) => ({
        model,
        commands: [
          {
            name: 'WebSocket.send',
            args: { data },
            effect: Effect.matchEffect(
              Effect.flatMap(Socket.get, ({ socket }) =>
                // A closed socket's send is a silent no-op per spec (only a
                // connecting socket throws), so check first: SendFailed either way.
                socket.readyState === 1
                  ? Effect.map(
                      Effect.sync(() => {
                        socket.send(data)
                      }),
                      () => WebSocketMessage.Sent({ data }),
                    )
                  : Effect.fail(
                      new Error(
                        `cannot send: socket is not open (readyState ${socket.readyState})`,
                      ),
                    ),
              ),
              {
                onFailure: error =>
                  Effect.succeed(WebSocketMessage.SendFailed({ message: failMessage(error) })),
                onSuccess: message => Effect.succeed(message),
              },
            ),
          },
        ],
      }),
    },
  })
}

/**
 * The prototype of `effect-reuse-sync-durable-DESIGN.md` §14.3: Sync's
 * exchange as an Effect `RpcGroup`, behind the `Transport` seam. Evidence for
 * the design note, not exported.
 *
 * The group carries the frame `layerSocket` writes (`cursor`, `pending`,
 * `epoch`; the RPC request id stands for the frame's `id`) and the notice
 * frame, as a stream. It stays as loose as the socket protocol where the
 * protocol needs it: `pending` is an array of unknown entries, since
 * `journalExchange` refuses a bad operation by its id and a typed array would
 * fail the whole call (the outbox trap), and the reply is unknown, since the
 * replica's own `decodeExchange` is the strict check of it.
 */
import { Effect, Layer, Queue, Schedule, Schema, Stream, type Duration } from 'effect'
import { Rpc, RpcClient, RpcGroup, RpcSerialization, RpcServer } from 'effect/rpc'
import { NetAddress } from 'effect/net'
import { type Socket, SocketServer } from 'effect/socket'
import { Transport, TransportError, type Operation, type TransportShape } from '../../src/index.js'

export const ExchangePayload = Schema.Struct({
  cursor: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  pending: Schema.Array(Schema.Unknown),
  epoch: Schema.optionalKey(Schema.String),
})

export const SyncRpcs = RpcGroup.make(
  Rpc.make('Exchange', {
    payload: ExchangePayload,
    success: Schema.Unknown,
    error: TransportError,
  }).annotate(Rpc.ParseOptions, { onExcessProperty: 'error' }),
  Rpc.make('Changes', { success: Schema.Void, stream: true }),
)

/** What a server answers with: `serveSocket`'s options, unchanged. */
export interface ServeOptions {
  readonly exchange: (
    cursor: number,
    pending: ReadonlyArray<Operation>,
    epoch?: string | undefined,
  ) => unknown | Promise<unknown>
  readonly changes?: ((listener: () => void) => () => void) | undefined
}

const failure = (error: unknown): TransportError =>
  new TransportError({ message: error instanceof Error ? error.message : String(error) })

/** The group's handlers over one connection's exchange, as `serveSocket` answers frames. */
export const handlers = (options: ServeOptions) =>
  SyncRpcs.toLayer({
    Exchange: ({ cursor, pending, epoch }) =>
      Effect.tryPromise({
        // Entries are unknown, as `serveSocket` passes them: the exchange decodes each.
        try: () =>
          Promise.resolve(options.exchange(cursor, pending as ReadonlyArray<Operation>, epoch)),
        catch: failure,
      }),
    // One notice at once: a replica that (re)subscribed may have missed some.
    Changes: () =>
      Stream.callback<void>(queue =>
        Effect.acquireRelease(
          Effect.sync(() => {
            Queue.offerUnsafe(queue, undefined)
            return options.changes?.(() => void Queue.offerUnsafe(queue, undefined))
          }),
          stop => Effect.sync(() => stop?.()),
        ),
      ),
  })

/** The `Transport` over a client of the group, whatever protocol it speaks. */
export const fromClient = <E>(
  client: RpcClient.RpcClient<RpcGroup.Rpcs<typeof SyncRpcs>, E>,
  options: { readonly resubscribe?: Duration.Input | undefined } = {},
): TransportShape => ({
  exchange: (cursor, pending, epoch) =>
    client
      .Exchange({ cursor, pending, ...(epoch === undefined ? {} : { epoch }) })
      .pipe(Effect.mapError(error => (error instanceof TransportError ? error : failure(error)))),
  // A dropped connection ends the stream; subscribing again is the reconnect.
  changes: client.Changes().pipe(
    Stream.retry(Schedule.spaced(options.resubscribe ?? '1 second')),
    // The schedule never ends: this only gives the seam the error-free stream it takes.
    Stream.catch(() => Stream.empty),
  ),
})

/** The client `Transport` over any RPC client protocol (a socket, HTTP, a worker). */
export const layerRpc = (
  options: { readonly resubscribe?: Duration.Input | undefined } = {},
): Layer.Layer<Transport, never, RpcClient.Protocol> =>
  Layer.effect(
    Transport,
    Effect.map(RpcClient.make(SyncRpcs), client => Transport.of(fromClient(client, options))),
  )

/**
 * Serves the group on one accepted socket, as `serveSocket` does: a server per
 * connection, so the handlers close over the principal the upgrade resolved.
 * Runs until the scope closes.
 */
export const serveRpcSocket = (socket: Socket.Socket, options: ServeOptions) =>
  RpcServer.make(SyncRpcs).pipe(
    Effect.provide(
      Layer.mergeAll(
        handlers(options),
        Layer.effect(RpcServer.Protocol, RpcServer.makeProtocolSocketServer).pipe(
          Layer.provide(
            Layer.succeed(SocketServer.SocketServer, {
              address: NetAddress.unixPathAddress('one-socket'),
              // The handler reads until the socket closes; its failure is that close.
              run: handler => Effect.andThen(Effect.ignore(handler(socket)), Effect.never),
            }),
          ),
          Layer.provide(RpcSerialization.layerJson),
        ),
      ),
    ),
  )

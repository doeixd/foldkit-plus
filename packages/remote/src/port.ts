/**
 * `foldkit-remote/port`: Remote over a `MessagePort`, for a server in a
 * worker or in the page (a sandbox). It speaks Effect's own RPC worker
 * protocol over the port, so reads, queries, mutations and live streams, their
 * typed errors and interruption all cross it; `foldkit-remote-server/port`
 * serves the other end.
 *
 * Built on `effect/workers` alone: a `MessagePort` platform for the client and
 * a one-port runner for the server, no browser package.
 */
import { Deferred, Effect, Exit, Layer, Queue, Scope } from 'effect'
import { RpcClient } from 'effect/rpc'
import * as Worker from 'effect/workers/Worker'
import type { WorkerError } from 'effect/workers/WorkerError'
import * as WorkerRunner from 'effect/workers/WorkerRunner'
import { Remote, type RemoteClient } from './index.js'
import { RemoteRpc } from './wire.js'

const platform = Worker.makePlatform<MessagePort>()({
  // Closing the client's scope tells the server the conversation is over.
  setup: ({ worker, scope }) =>
    Effect.as(
      Scope.addFinalizer(
        scope,
        Effect.sync(() => worker.postMessage([1])),
      ),
      worker,
    ),
  listen: ({ port, emit, scope }) => {
    const onMessage = (event: MessageEvent) => emit(event.data)
    port.addEventListener('message', onMessage)
    port.start()
    return Scope.addFinalizer(
      scope,
      Effect.sync(() => port.removeEventListener('message', onMessage)),
    )
  },
})

/**
 * Effect's RPC worker protocol over a `MessagePort`: what `port` runs on, for
 * an RPC client of `RemoteRpc` made by hand. `open` is called for each
 * connection the protocol makes (once, and again if it restarts), so it opens
 * a new conversation each time, such as a `MessageChannel` whose other port
 * goes to the server.
 */
export const portProtocol = (
  open: () => MessagePort,
): Layer.Layer<RpcClient.Protocol, WorkerError> =>
  RpcClient.layerProtocolWorker({ size: 1 }).pipe(
    Layer.provide(
      Layer.merge(
        Layer.succeed(Worker.WorkerPlatform)(platform),
        Worker.layerSpawner(() => open()),
      ),
    ),
  )

/** Remote's client over a `MessagePort`: `portProtocol` under `Remote.clientLayer`. */
export const port = (open: () => MessagePort): Layer.Layer<RemoteClient> =>
  Layer.unwrap(Effect.map(RpcClient.make(RemoteRpc), client => Remote.clientLayer(client))).pipe(
    Layer.provide(portProtocol(open)),
    // A port that cannot be set up is a broken sandbox, not a failed read:
    // each call's own failure is a Remote error, as over HTTP.
    Layer.orDie,
  )

/**
 * The server's side of one port: Effect's `WorkerRunnerPlatform` over a single
 * `MessagePort`, for `RpcServer.layerProtocolWorkerRunner`, and `closed`,
 * which completes when the client closes its end. `foldkit-remote-server/port`
 * uses it.
 */
export const portRunner = (
  served: MessagePort,
): {
  readonly platform: WorkerRunner.WorkerRunnerPlatform['Service']
  readonly closed: Effect.Effect<void>
} => {
  const closed = Deferred.makeUnsafe<void>()
  const platform: WorkerRunner.WorkerRunnerPlatform['Service'] = {
    start: <O, I>() =>
      Effect.gen(function* () {
        const disconnects = yield* Queue.make<number>()
        const sendUnsafe = (_: number, message: O, transfer?: ReadonlyArray<unknown>) =>
          served.postMessage([1, message], {
            transfer: [...(transfer ?? [])] as Array<Transferable>,
          })
        const run = <A, E, R>(
          handler: (portId: number, message: I) => Effect.Effect<A, E, R> | void,
        ) =>
          Effect.scopedWith(scope =>
            Effect.gen(function* () {
              const fork = Effect.runForkWith(yield* Effect.context<R>())
              const onMessage = (event: MessageEvent) => {
                const message = event.data as WorkerRunner.PlatformMessage<I>
                if (message[0] === 1) {
                  Deferred.doneUnsafe(closed, Exit.void)
                  return
                }
                const result = handler(0, message[1])
                if (Effect.isEffect(result)) fork(result)
              }
              served.addEventListener('message', onMessage)
              served.start()
              served.postMessage([0])
              yield* Scope.addFinalizer(
                scope,
                Effect.sync(() => {
                  served.removeEventListener('message', onMessage)
                  served.close()
                }),
              )
              yield* Deferred.await(closed)
            }),
          )
        const runner: WorkerRunner.WorkerRunner<O, I> = {
          run,
          send: (portId, message, transfer) =>
            Effect.sync(() => sendUnsafe(portId, message, transfer)),
          sendUnsafe,
          disconnects,
        }
        return runner
      }),
  }
  return { platform, closed: Deferred.await(closed) }
}

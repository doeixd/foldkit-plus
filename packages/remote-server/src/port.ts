/**
 * `foldkit-remote-server/port`: `RemoteServer`'s handlers answering over a
 * `MessagePort`, the other end of `foldkit-remote/port`'s `port`. A host in a
 * worker or a page hands it the port each conversation opens.
 */
import { Effect, Layer, type Scope } from 'effect'
import { RpcServer } from 'effect/rpc'
import type { WorkerError } from 'effect/workers/WorkerError'
import * as WorkerRunner from 'effect/workers/WorkerRunner'
import { RemoteRpc, type RemoteRpcClient } from 'foldkit-remote'
import { portRunner } from 'foldkit-remote/port'

/**
 * Serves `handlers` (`RemoteServer.handlers(...)`) over `port`, returning once
 * the client closes its end; interrupt it to stop sooner. Provide what the
 * handlers need. It fails with a `WorkerError` only when the port itself
 * breaks.
 */
export const servePort = <R>(
  handlers: RemoteRpcClient<R>,
  port: MessagePort,
): Effect.Effect<void, WorkerError, Exclude<R, Scope.Scope>> => {
  const { platform, closed } = portRunner(port)
  return Effect.scoped(
    Layer.build(
      RpcServer.layer(RemoteRpc).pipe(
        Layer.provide(RemoteRpc.toLayer(handlers)),
        Layer.provide(RpcServer.layerProtocolWorkerRunner),
        Layer.provide(Layer.succeed(WorkerRunner.WorkerRunnerPlatform)(platform)),
      ),
    ).pipe(Effect.andThen(closed)),
  )
}

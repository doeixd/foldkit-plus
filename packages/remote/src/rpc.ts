/**
 * Remote over Effect RPC: what a call whose transport failed is, and an HTTP
 * protocol that lets a response's status reach the client, so a request the
 * server refused (a 401, a 403, a 413) is told apart from one nothing answered
 * (#360, #366).
 */
import { Effect, Layer, Option } from 'effect'
import { HttpClient, HttpClientError, HttpClientRequest } from 'effect/http'
import { RpcClient, type RpcClientError, type RpcSerialization } from 'effect/rpc'
import { RemoteUnauthenticated, RemoteUnreachable } from './wire.js'

/**
 * Effect RPC's client protocol over HTTP, posting to `url` as
 * `RpcClient.layerProtocolHttp({ url })` does, except that a response whose
 * status is not 2xx fails the call with that status rather than being read
 * as RPC frames, which it is not. `Remote.clientLayer` reads a 401, a 403
 * and a 413 as `Remote.http` does.
 */
export const rpcProtocolHttp = (
  url: string,
): Layer.Layer<
  RpcClient.Protocol,
  never,
  RpcSerialization.RpcSerialization | HttpClient.HttpClient
> =>
  Layer.effect(RpcClient.Protocol)(
    Effect.flatMap(HttpClient.HttpClient, client =>
      RpcClient.makeProtocolHttp(
        HttpClient.filterStatusOk(HttpClient.mapRequest(client, HttpClientRequest.prependUrl(url))),
      ),
    ),
  )

/** The HTTP status a failed RPC call was answered with, when its protocol kept it. */
const statusOf = (error: RpcClientError.RpcClientError): Option.Option<number> =>
  error.reason instanceof HttpClientError.HttpClientErrorSchema &&
  error.reason.cause instanceof HttpClientError.StatusCodeError
    ? Option.some(error.reason.cause.response.status)
    : Option.none()

/**
 * An RPC call whose transport failed, as the call's failure, read as
 * `Remote.http` reads the same status. A 401 is `RemoteUnauthenticated` for
 * every call kind; a 403 and a 413 are refused again however often they are
 * sent, so `refused` makes them the call's own error (a mutation's 403 is
 * `RemoteForbidden`). A durable write so refused is settled. Anything else is
 * no answer, and a write may have reached the server.
 */
export const rpcFailure =
  <E>(refused: (status: 403 | 413, message: string) => E) =>
  (
    error: RpcClientError.RpcClientError,
  ): Effect.Effect<never, E | RemoteUnauthenticated | RemoteUnreachable> => {
    const status = statusOf(error)
    if (Option.contains(status, 401)) {
      return Effect.fail(new RemoteUnauthenticated({ message: '401 Unauthorized' }))
    }
    if (Option.contains(status, 403)) return Effect.fail(refused(403, '403 Forbidden'))
    if (Option.contains(status, 413)) {
      return Effect.fail(refused(413, 'The request body is larger than the server takes (413)'))
    }
    return Effect.fail(new RemoteUnreachable({ message: error.message }))
  }

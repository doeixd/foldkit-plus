/**
 * Remote over Effect RPC: what a call whose transport failed is, and an HTTP
 * protocol that lets a response's status reach the client, so a request the
 * server refused for its size is told apart from one nothing answered (#360).
 */
import { Effect, Layer, Option } from 'effect'
import { HttpClient, HttpClientError, HttpClientRequest } from 'effect/http'
import { RpcClient, type RpcClientError, type RpcSerialization } from 'effect/rpc'
import { RemoteUnreachable } from './wire.js'

/**
 * Effect RPC's client protocol over HTTP, posting to `url` as
 * `RpcClient.layerProtocolHttp({ url })` does, except that a response whose
 * status is not 2xx fails the call with that status rather than being read
 * as RPC frames, which it is not. `Remote.clientLayer` reads a 413 as the
 * call's own error.
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
 * An RPC call whose transport failed, as the call's failure. A 413 is the
 * server refusing the request for its size, refused again however often it
 * is sent: the call's own error, `refused`, so a durable write is settled.
 * Anything else is no answer, and a write may have reached the server.
 */
export const rpcFailure =
  <E>(refused: (message: string) => E) =>
  (error: RpcClientError.RpcClientError): Effect.Effect<never, E | RemoteUnreachable> =>
    Effect.fail(
      Option.contains(statusOf(error), 413)
        ? refused('The request body is larger than the server takes (413)')
        : new RemoteUnreachable({ message: error.message }),
    )

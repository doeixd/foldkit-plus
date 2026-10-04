/**
 * The browser's transport: Remote's three calls as JSON over one HTTP endpoint.
 * It has the shape of Remote's RPC client, so `Remote.clientLayer` adapts it and
 * coalesces reads as it does for any transport. There is no live stream here.
 */
import { Effect, Stream } from 'effect'
import {
  RemoteMutationError,
  RemoteQueryError,
  RemoteReadError,
  type RemoteRpcClient,
} from 'foldkit-remote'

export type Operation = 'read' | 'query' | 'mutate'

const post = <A, E>(
  url: string,
  operation: Operation,
  payload: unknown,
  fail: (message: string) => E,
): Effect.Effect<A, E> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation, payload }),
      })
      const body = (await response.json()) as { readonly result?: A; readonly error?: string }
      if (!response.ok || body.result === undefined)
        throw new Error(body.error ?? response.statusText)
      return body.result
    },
    catch: error => fail(error instanceof Error ? error.message : String(error)),
  })

export const httpClient = (url: string): RemoteRpcClient => ({
  FoldkitRemoteRead: payload =>
    post(url, 'read', payload, message => new RemoteReadError({ message })),
  FoldkitRemoteQuery: payload =>
    post(url, 'query', payload, message => new RemoteQueryError({ message })),
  FoldkitRemoteMutate: payload =>
    post(url, 'mutate', payload, message => new RemoteMutationError({ message })),
  FoldkitRemoteLive: () => Stream.empty,
})

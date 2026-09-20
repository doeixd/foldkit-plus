/**
 * The browser's transport: Remote's three calls as JSON over one HTTP endpoint,
 * each saying which chair it is asked from. It has the shape of Remote's RPC
 * client, so `Remote.clientLayer` adapts it. There is no live stream here.
 */
import { Effect, Stream } from 'effect'
import {
  RemoteMutationError,
  RemoteQueryError,
  RemoteReadError,
  type RemoteRpcClient,
} from 'foldkit-remote'

export type Operation = 'read' | 'query' | 'mutate'

/** Who the page is, in this example: a name in the address. A real one signs in. */
export const chairs = ['wren', 'edda', 'visitor'] as const
export type Chair = (typeof chairs)[number]
export const chairOf = (search: string): Chair => {
  const asked = new URLSearchParams(search).get('as')
  return chairs.find(chair => chair === asked) ?? 'wren'
}

const post = <A, E>(
  url: string,
  chair: Chair,
  operation: Operation,
  payload: unknown,
  fail: (message: string) => E,
): Effect.Effect<A, E> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-chair': chair },
        body: JSON.stringify({ operation, payload }),
      })
      const body = (await response.json()) as { readonly result?: A; readonly error?: string }
      if (!response.ok || body.result === undefined)
        throw new Error(body.error ?? response.statusText)
      return body.result
    },
    catch: error => fail(error instanceof Error ? error.message : String(error)),
  })

export const httpClient = (url: string, chair: Chair): RemoteRpcClient => ({
  FoldkitRemoteRead: payload =>
    post(url, chair, 'read', payload, message => new RemoteReadError({ message })),
  FoldkitRemoteQuery: payload =>
    post(url, chair, 'query', payload, message => new RemoteQueryError({ message })),
  FoldkitRemoteMutate: payload =>
    post(url, chair, 'mutate', payload, message => new RemoteMutationError({ message })),
  FoldkitRemoteLive: () => Stream.empty,
})

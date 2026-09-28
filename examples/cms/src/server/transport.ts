/**
 * The browser's transport: Remote's three calls as JSON to one endpoint, each
 * saying which chair it is asked from, over HTTP (`pnpm dev`) or to a server
 * running in the page (the published demo). It has the shape of Remote's RPC
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
/** The chair the address names; `fallback` when it names none (a writer, or on the site a visitor). */
export const chairOf = (search: string, fallback: Chair = 'wren'): Chair => {
  const asked = new URLSearchParams(search).get('as')
  return chairs.find(chair => chair === asked) ?? fallback
}

/** What the endpoint answers: a result, or why there is none. */
export type Answer =
  { readonly ok: true; readonly result: unknown } | { readonly ok: false; readonly error: string }

/** A request's JSON body sent from a chair, and the endpoint's answer to it. */
export type Send = (chair: Chair, body: string) => Promise<Answer>

/** Sends to the endpoint at `url` over HTTP. */
export const httpSend =
  (url: string): Send =>
  async (chair, body) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chair': chair },
      body,
    })
    const answered = (await response.json()) as {
      readonly result?: unknown
      readonly error?: string
    }
    return response.ok && answered.result !== undefined
      ? { ok: true, result: answered.result }
      : { ok: false, error: answered.error ?? response.statusText }
  }

const post = <A, E>(
  send: Send,
  chair: Chair,
  operation: Operation,
  payload: unknown,
  fail: (message: string) => E,
): Effect.Effect<A, E> =>
  Effect.tryPromise({
    try: async () => {
      const answered = await send(chair, JSON.stringify({ operation, payload }))
      if (!answered.ok) throw new Error(answered.error)
      // The endpoint answered the request this call made, so its result is this call's.
      return answered.result as A
    },
    catch: error => fail(error instanceof Error ? error.message : String(error)),
  })

export const remoteClient = (send: Send, chair: Chair): RemoteRpcClient => ({
  FoldkitRemoteRead: payload =>
    post(send, chair, 'read', payload, message => new RemoteReadError({ message })),
  FoldkitRemoteQuery: payload =>
    post(send, chair, 'query', payload, message => new RemoteQueryError({ message })),
  FoldkitRemoteMutate: payload =>
    post(send, chair, 'mutate', payload, message => new RemoteMutationError({ message })),
  FoldkitRemoteLive: () => Stream.empty,
})

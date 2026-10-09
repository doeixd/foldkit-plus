/**
 * Wire drivers both the test and the demo steer by: Remote reads, queries,
 * and live streams through the real `httpWithLive` client, and Sync
 * exchanges as raw frames over an upgraded socket. Assertion-free; callers
 * decide what each answer proves.
 */
import { Effect, Stream } from 'effect'
import { REMOTE_PROTOCOL_VERSION, Remote, type RemoteRpcClient } from 'foldkit-remote'
import type { Miniflare } from 'miniflare'

/** Remote over HTTP with live, posting through `via`. */
export const remoteClient = (url: string, actor: string, via: typeof fetch): RemoteRpcClient =>
  Remote.httpWithLive(url, {
    fetch: via,
    headers: () => ({ 'x-actor': actor }),
  })

/** Lets a just-opened live stream register before the change lands (local only). */
export const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** One entity read: the fields asked for, or the request's failure. */
export const readTodo = (client: RemoteRpcClient, id: string, fields: ReadonlyArray<string>) =>
  Effect.runPromise(
    client.FoldkitRemoteRead({
      version: REMOTE_PROTOCOL_VERSION,
      requests: [{ entity: 'Todo', id, fields: [...fields] }],
    }),
  )

/** The `AllTodos` connection's edges for a window. */
export const queryTodos = (
  client: RemoteRpcClient,
  window: { readonly first?: number; readonly after?: string },
) =>
  Effect.runPromise(client.FoldkitRemoteQuery({ query: 'AllTodos', input: {}, window })).then(
    page => page.edges.map(edge => edge.id),
  )

/**
 * The first live change of some requirements, collected: start this before the
 * change lands, and collect it while the stream is open.
 */
export const firstChange = (
  client: RemoteRpcClient,
  requirements: ReadonlyArray<{ entity: string; id: string; fields: ReadonlyArray<string> }>,
) =>
  client
    .FoldkitRemoteLive({
      version: REMOTE_PROTOCOL_VERSION,
      requirements: requirements.map(requirement => ({
        ...requirement,
        fields: [...requirement.fields],
      })),
      after: 0,
    })
    .pipe(Stream.take(1), Stream.runCollect)

export interface ClientSocket {
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void
  removeEventListener(type: string, listener: (event: { data?: unknown }) => void): void
  send(data: string): void
  accept(): void
  close(): void
}

/** Upgrades `/sync` and returns the open client socket. */
export const upgradeSync = async (
  mf: Pick<Miniflare, 'dispatchFetch'>,
  actor: string,
): Promise<{ status: number; socket: ClientSocket | null }> => {
  const response = await mf.dispatchFetch('http://localhost/sync', {
    headers: { Upgrade: 'websocket', 'x-actor': actor },
  })
  const socket = response.webSocket
  if (socket === null) return { status: response.status, socket: null }
  // Miniflare names three events where the interface takes any string.
  const client = socket as unknown as ClientSocket
  client.accept()
  return { status: response.status, socket: client }
}

/** One exchange frame round-trip over an open socket. */
export const exchange = (
  socket: ClientSocket,
  frame: { readonly id: string; readonly cursor: number; readonly pending: ReadonlyArray<unknown> },
): Promise<{ result?: unknown; error?: string }> =>
  new Promise(resolve => {
    const listener = (event: { data?: unknown }): void => {
      if (typeof event.data !== 'string') return
      const parsed = JSON.parse(event.data) as { id?: unknown; result?: unknown; error?: string }
      if (parsed.id !== frame.id) return
      socket.removeEventListener('message', listener)
      resolve(parsed)
    }
    socket.addEventListener('message', listener)
    socket.send(JSON.stringify(frame))
  })

/** A client-authored operation envelope, as a replica would send it. */
export const syncOp = (
  replica: string,
  localSequence: number,
  message:
    | { readonly _tag: 'CreatedTodo'; readonly id: string; readonly title: string }
    | { readonly _tag: 'ToggledTodo'; readonly id: string },
) => ({
  protocolVersion: 1,
  schemaVersion: 1,
  documentId: 'todos',
  replicaId: replica,
  localSequence,
  opId: `${replica}:${localSequence}`,
  baseCursor: 0,
  message,
})

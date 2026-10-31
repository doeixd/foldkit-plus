/**
 * Wire drivers both the test and the demo steer by: Remote reads, queries,
 * and live streams through the real `httpWithLive` client, and Sync
 * exchanges as raw frames over an upgraded socket. Assertion-free; callers
 * decide what each answer proves.
 */
import { Effect, Stream } from 'effect'
import {
  REMOTE_PROTOCOL_VERSION,
  Remote,
  type QueryRequest,
  type RemoteJsonClient,
} from 'foldkit-remote'
import type { CloudflareStack } from './stack.js'
import { httpWithLive } from 'foldkit-remote/live'

/** Remote over HTTP with live, posting through `via`. */
export const remoteClient = (url: string, actor: string, via: typeof fetch): RemoteJsonClient =>
  httpWithLive(url, {
    fetch: via,
    headers: () => ({ 'x-actor': actor }),
  })

/** Lets a just-opened live stream register before the change lands (local only). */
export const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** One entity read: the fields asked for, or the request's failure. */
export const readTodo = (client: RemoteJsonClient, id: string, fields: ReadonlyArray<string>) =>
  Effect.runPromise(
    client.FoldkitRemoteRead({
      version: REMOTE_PROTOCOL_VERSION,
      requests: [{ entity: 'Todo', id, fields: [...fields] }],
    }),
  )

/** The `AllTodos` connection's edges for a window. */
export const queryTodos = (
  client: RemoteJsonClient,
  window: { readonly first?: number; readonly after?: string },
) =>
  Effect.runPromise(client.FoldkitRemoteQuery({ query: 'AllTodos', input: {}, window })).then(
    page => page.edges.map(edge => edge.id),
  )

/** What a live stream subscribes to: rows, and lists read live as a page's read sends them. */
export interface LiveSubscription {
  readonly requirements: ReadonlyArray<{
    entity: string
    id: string
    fields: ReadonlyArray<string>
  }>
  readonly queries?: ReadonlyArray<typeof QueryRequest.Type>
}

/**
 * The live changes of a subscription: start this before the change lands, and
 * collect it while the stream is open.
 */
const liveEvents = (client: RemoteJsonClient, { requirements, queries }: LiveSubscription) =>
  client.FoldkitRemoteLive({
    version: REMOTE_PROTOCOL_VERSION,
    requirements: requirements.map(requirement => ({
      ...requirement,
      fields: [...requirement.fields],
    })),
    ...(queries === undefined ? {} : { queries }),
    after: 0,
  })

/** The first live change of some requirements. Start it before the change lands. */
export const firstChange = (
  client: RemoteJsonClient,
  requirements: LiveSubscription['requirements'],
) => liveEvents(client, { requirements }).pipe(Stream.take(1), Stream.runCollect)

const aboutId = (
  event: { readonly _tag: string; readonly id?: string; readonly edge?: { readonly id: string } },
  id: string,
): boolean => {
  if (event._tag === 'EntityPatched' || event._tag === 'EntityDeleted') return event.id === id
  if (event._tag === 'ConnectionInsert' || event._tag === 'ConnectionRemove')
    return event.edge?.id === id
  return false
}

/**
 * The next `count` live changes, optionally only those that name `id`.
 * `firstChange` stays the one-event form the existing tests collect.
 */
export const takeChanges = (
  client: RemoteJsonClient,
  subscription: LiveSubscription,
  count: number,
  id?: string,
) => {
  const events = liveEvents(client, subscription)
  const chosen = id === undefined ? events : events.pipe(Stream.filter(event => aboutId(event, id)))
  return chosen.pipe(Stream.take(count), Stream.runCollect)
}

export interface ClientSocket {
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void
  removeEventListener(type: string, listener: (event: { data?: unknown }) => void): void
  send(data: string): void
  accept(): void
  close(): void
}

/** Upgrades `/sync` and returns the open client socket. */
export const upgradeSync = async (
  dispatch: CloudflareStack['dispatch'],
  actor: string,
): Promise<{ status: number; socket: ClientSocket | null }> => {
  const response = await dispatch('http://localhost/sync', {
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
    | { readonly _tag: 'RenamedTodo'; readonly id: string; readonly title: string }
    | { readonly _tag: 'ToggledTodo'; readonly id: string }
    | { readonly _tag: 'DeletedTodo'; readonly id: string },
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

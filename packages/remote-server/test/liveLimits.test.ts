/**
 * A live subscription is admitted once, by the handler, before any live
 * source or the hub is asked: more ids of one Entity than `maxIdsPerEntity`
 * is refused with `RemoteLiveRefused` on every live path alike, and the
 * refusal reaches a fetch client as that error. `pollLive` under the handler
 * is tested in `foldkit-remote-drizzle`'s `pollLimits.test.ts`.
 */
import { Effect, Exit, Layer, Schema, Stream } from 'effect'
import { RpcTest } from 'effect/rpc'
import {
  Entity,
  REMOTE_PROTOCOL_VERSION,
  Remote,
  RemoteClient,
  RemoteRpc,
  relationAlias,
  type ReadRequest,
} from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { serveFetch } from '../src/fetch.js'
import { RemoteServer, type LiveHub, type ServerDefinition } from '../src/index.js'
import { httpWithLive } from 'foldkit-remote/live'

const Item = Entity.make('Item', Schema.Struct({ id: Schema.String, name: Schema.String }))

const ItemSource = RemoteServer.entity<string>(Item, {
  read: ({ ids }) => Effect.succeed(ids.map(id => ({ id, values: { name: id } }))),
})

type Requirement = Schema.Schema.Type<typeof ReadRequest>

/** `count` distinct ids, the first asked twice with other fields: duplicates count once. */
const requirementsFor = (count: number): ReadonlyArray<Requirement> => [
  { entity: 'Item', id: 'i0', fields: ['id'] },
  ...Array.from({ length: count }, (_, at) => ({
    entity: 'Item',
    id: `i${at}`,
    fields: ['name'],
  })),
]

/** A hand-written live source that records what it was asked and stays open. */
const recordingSource = () => {
  const asked: Array<ReadonlyArray<Requirement>> = []
  const source = RemoteServer.live<string>(Item, {
    subscribe: ({ requirements }) => {
      asked.push(requirements)
      return Stream.never
    },
  })
  return { asked, source }
}

/** Opens a live stream through the RPC handlers: `Refused` or `Open` once it has subscribed. */
const open = (
  server: ServerDefinition<string>,
  requirements: ReadonlyArray<Requirement>,
  options: { readonly hub?: LiveHub<string>; readonly maxIdsPerEntity?: number },
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(RemoteRpc)
      return yield* client
        .FoldkitRemoteLive({ version: REMOTE_PROTOCOL_VERSION, requirements, after: 0 })
        .pipe(
          Stream.runDrain,
          Effect.timeoutOrElse({
            duration: '50 millis',
            orElse: () => Effect.succeed('Open' as const),
          }),
          Effect.catchTag('RemoteLiveRefused', error => Effect.succeed(error)),
        )
    }).pipe(
      Effect.scoped,
      Effect.provide(
        RemoteRpc.toLayer(
          RemoteServer.handlers(server, 'ada', {
            ...(options.hub === undefined ? {} : { live: options.hub }),
            ...(options.maxIdsPerEntity === undefined
              ? {}
              : { maxIdsPerEntity: options.maxIdsPerEntity }),
          }),
        ),
      ),
    ),
  )

describe('a live subscription over maxIdsPerEntity', () => {
  it('is refused before a live source is asked, and opens at the limit', async () => {
    const { asked, source } = recordingSource()
    const server = RemoteServer.make({ entities: [ItemSource], live: [source] })

    const refused = await open(server, requirementsFor(4), { maxIdsPerEntity: 3 })
    expect(refused).toMatchObject({
      _tag: 'RemoteLiveRefused',
      message: 'Too many "Item" ids in one live subscription (at most 3)',
    })
    expect(asked).toEqual([])

    expect(await open(server, requirementsFor(3), { maxIdsPerEntity: 3 })).toBe('Open')
    expect(asked).toHaveLength(1)
    expect(new Set(asked[0]!.map(requirement => requirement.id)).size).toBe(3)
  })

  it('is refused before the hub registers it, and the hub registers one at the limit', async () => {
    const server = RemoteServer.make({ entities: [ItemSource] })
    const hub = Effect.runSync(RemoteServer.liveHub([ItemSource]))
    const sizeWhileOpen = (count: number) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(RemoteRpc)
          const fiber = yield* client
            .FoldkitRemoteLive({
              version: REMOTE_PROTOCOL_VERSION,
              requirements: requirementsFor(count),
              after: 0,
            })
            // Flipped, so the fiber ends with the refusal as its value.
            .pipe(Stream.runDrain, Effect.flip, Effect.forkChild)
          for (let i = 0; i < 20; i++) yield* Effect.yieldNow
          const size = yield* hub.size
          const exit = fiber.pollUnsafe()
          const ended =
            exit === undefined ? 'running' : Exit.isSuccess(exit) ? exit.value._tag : 'failed'
          return { size, ended }
        }).pipe(
          Effect.scoped,
          Effect.provide(
            RemoteRpc.toLayer(
              RemoteServer.handlers(server, 'ada', { live: hub, maxIdsPerEntity: 3 }),
            ),
          ),
        ),
      )
    const over = await sizeWhileOpen(4)
    expect(over.size).toBe(0)
    expect(over.ended).toBe('RemoteLiveRefused')
    expect(await sizeWhileOpen(3)).toEqual({ size: 1, ended: 'running' })
  })

  it('counts every entity on its own, as a read batch does', async () => {
    const { asked, source } = recordingSource()
    const server = RemoteServer.make({ entities: [ItemSource], live: [source] })
    const two = [
      ...requirementsFor(2),
      { entity: 'Other', id: 'o1', fields: ['name'] },
      { entity: 'Other', id: 'o2', fields: ['name'] },
    ]
    expect(await open(server, two, { maxIdsPerEntity: 2 })).toBe('Open')
    expect(asked).toHaveLength(1)
  })

  it('is refused for more pages of one relation than a read may ask', async () => {
    const { asked, source } = recordingSource()
    const server = RemoteServer.make({ entities: [ItemSource], live: [source] })
    const pagesOf = (count: number): ReadonlyArray<Requirement> => {
      const pages = Array.from({ length: count }, (_, at) =>
        relationAlias('tags', { first: at + 1 }),
      )
      const windows = Object.fromEntries(pages.map((name, at) => [name, { first: at + 1 }]))
      return [{ entity: 'Item', id: 'i0', fields: pages, windows }]
    }
    expect(await open(server, pagesOf(5), {})).toMatchObject({
      _tag: 'RemoteLiveRefused',
      message: 'Too many pages of "Item.tags" in one live subscription',
    })
    expect(asked).toEqual([])
    expect(await open(server, pagesOf(4), {})).toBe('Open')
  })

  it('reaches a fetch client as RemoteLiveRefused, through serveFetch', async () => {
    const { asked, source } = recordingSource()
    const serve = serveFetch({
      server: RemoteServer.make({ entities: [ItemSource], live: [source] }),
      resolvePrincipal: () => Effect.succeed('ada'),
      layer: () => Layer.empty,
      maxIdsPerEntity: 3,
    })
    const client = httpWithLive('http://worker.test/remote', {
      fetch: (input, init) => serve(new Request(input, init), undefined),
    })
    const outcome = await Effect.runPromise(
      RemoteClient.pipe(
        Effect.flatMap(remote =>
          remote
            .live({ requirements: requirementsFor(4), queries: [], after: 0 })
            .pipe(Stream.runDrain),
        ),
        Effect.flip,
        Effect.provide(Remote.clientLayer(client)),
      ),
    )
    expect(outcome).toMatchObject({
      _tag: 'RemoteLiveRefused',
      message: 'Too many "Item" ids in one live subscription (at most 3)',
    })
    expect(asked).toEqual([])
  })
})

/**
 * A list read live (#270), as the handler admits and resolves it: the page's
 * own request becomes a `LiveQuery` named as the page keys the list, run as
 * the principal with the page's window, and handed to the live source of the
 * entity it lists; a list that a read every tick may not be is refused first.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { RpcTest } from 'effect/rpc'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Order } from 'foldkit-entity'
import {
  Query,
  REMOTE_PROTOCOL_VERSION,
  Remote,
  RemoteRpc,
  terminal,
  type QueryRequest,
  type ReadRequest,
} from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { RemoteServer, type LiveQuery } from '../src/index.js'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Tag = Entity.define('Tag', Schema.Struct({ id: Schema.String }))
const All = Query.define('All', { tag: Schema.String }, () =>
  Query.from(Item).pipe(Query.orderBy(Order.asc(Item.fields.id))),
)
const Row = Entity.select(Item, { name: true })

const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Item], queries: [All] })
const unread = { remote: Remote.initial }

/** The live entry of a page that reads the list `tag` live with `first`. */
const pageOf = (tag: string, first = 2) => {
  const read = Data.query(All, { tag }, { select: Row, first, live: true })
  return Data.subscriptions({ list: Data.active('List', () => Option.some(read)) })['list.live']
}

/** The page's own request for the list `tag`. */
const pageRequest = (tag: string, first = 2): typeof QueryRequest.Type =>
  pageOf(tag, first).modelToDependencies(unread).queries[0]!

/** A server whose query records each run, and whose live sources record what they were given. */
const serving = () => {
  const ran: Array<unknown> = []
  const given: Record<string, Array<ReadonlyArray<LiveQuery>>> = { Item: [], Tag: [] }
  const recording = (entity: typeof Item | typeof Tag) =>
    RemoteServer.live<string>(entity, {
      subscribe: ({ queries }) => {
        given[entity.name]!.push(queries)
        return Stream.never
      },
    })
  const server = RemoteServer.make({
    entities: [
      RemoteServer.entity<string>(Item, { read: () => Effect.succeed([]) }),
      RemoteServer.entity<string>(Tag, { read: () => Effect.succeed([]) }),
    ],
    queries: [
      RemoteServer.query(All, ({ input, window, principal }) => {
        ran.push({ input, window, principal })
        return Effect.succeed({
          edges: [{ entity: 'Item', id: 'i1', key: 'Item:i1' }],
          start: terminal,
          end: terminal,
        })
      }),
    ],
    live: [recording(Item), recording(Tag)],
  })
  return { ran, given, server }
}

/** Opens a live stream through the RPC handlers: the refusal, or `Open` once it has subscribed. */
const open = (
  server: ReturnType<typeof serving>['server'],
  subscription: {
    readonly requirements?: ReadonlyArray<typeof ReadRequest.Type>
    readonly queries: ReadonlyArray<typeof QueryRequest.Type>
  },
  maxIdsPerEntity = 1000,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(RemoteRpc)
      return yield* client
        .FoldkitRemoteLive({
          version: REMOTE_PROTOCOL_VERSION,
          requirements: [...(subscription.requirements ?? [])],
          queries: subscription.queries,
          after: 0,
        })
        .pipe(
          Stream.runDrain,
          Effect.timeoutOrElse({
            duration: '50 millis',
            orElse: () => Effect.succeed('Open' as const),
          }),
          Effect.catchTag('RemoteLiveRefused', error => Effect.succeed(error.message)),
        )
    }).pipe(
      Effect.scoped,
      Effect.provide(RemoteRpc.toLayer(RemoteServer.handlers(server, 'ada', { maxIdsPerEntity }))),
    ),
  )

describe('a list read live, through the handler', () => {
  it('is named as the page keys it, and run as the principal with the page’s window', async () => {
    const { ran, given, server } = serving()
    const request = pageRequest('red')
    expect(await open(server, { queries: [request] })).toBe('Open')
    const [queries] = given.Item!
    expect(queries!.map(query => ({ identity: query.identity, select: query.select }))).toEqual([
      { identity: All.ref({ tag: 'red' }).identity, select: request.select },
    ])
    expect(await Effect.runPromise(queries![0]!.edges)).toEqual([
      { entity: 'Item', id: 'i1', key: 'Item:i1' },
    ])
    expect(ran).toEqual([{ input: { tag: 'red' }, window: { first: 2 }, principal: 'ada' }])
  })

  it('reaches the live source from the page, through Remote.clientLayer', async () => {
    const { given, server } = serving()
    const entry = pageOf('red')
    const dependencies = entry.modelToDependencies(unread)
    await Effect.runPromise(
      Stream.runDrain(entry.dependenciesToStream(dependencies)).pipe(
        Effect.timeoutOrElse({ duration: '50 millis', orElse: () => Effect.void }),
        Effect.provide(Remote.clientLayer(RemoteServer.handlers(server, 'ada'))),
      ),
    )
    expect(given.Item!.map(queries => queries.map(query => query.identity))).toEqual([
      [All.ref({ tag: 'red' }).identity],
    ])
  })

  it('is handed only to the live source of the entity it lists', async () => {
    const { given, server } = serving()
    const tagged = { requirements: [{ entity: 'Tag', id: 't1', fields: ['id'] }] }
    expect(await open(server, { ...tagged, queries: [pageRequest('red')] })).toBe('Open')
    expect(given.Tag).toEqual([[]])
    expect(given.Item!.map(queries => queries.length)).toEqual([1])
  })

  it.each([
    [
      'a query the server does not register',
      { ...pageRequest('red'), query: 'Gone' },
      'Unknown query "Gone"',
    ],
    ['no select', { ...pageRequest('red'), select: undefined }, 'read live with no select'],
    [
      'a select of another entity than it lists',
      { ...pageRequest('red'), select: { entity: 'Tag', fields: ['id'] } },
      'Query "All" lists "Item", but is read live selecting "Tag"',
    ],
    ['no first', { ...pageRequest('red'), window: {} }, 'read live with no first'],
    [
      'an input its query does not decode',
      { ...pageRequest('red'), input: { tag: 5 } },
      'Invalid input of query "All"',
    ],
  ])('is refused for %s, before any live source is asked', async (_, request, message) => {
    const { given, server } = serving()
    expect(await open(server, { queries: [request] })).toContain(message)
    expect(given).toEqual({ Item: [], Tag: [] })
  })

  it('counts its first with the ids of its entity the subscription names', async () => {
    const { given, server } = serving()
    const ids = (count: number) =>
      Array.from({ length: count }, (_, at) => ({ entity: 'Item', id: `i${at}`, fields: ['name'] }))
    const refused = await open(
      server,
      { requirements: ids(2), queries: [pageRequest('red', 2)] },
      3,
    )
    expect(refused).toContain('Too many "Item" ids in one live subscription (at most 3')
    expect(given.Item).toEqual([])
    expect(await open(server, { requirements: ids(1), queries: [pageRequest('red', 2)] }, 3)).toBe(
      'Open',
    )
  })
})

// Each live source numbers its changes from the one `after` the client sent, and the
// client keeps one cursor for the stream: the server numbers the merged stream (#286).
describe('two live sources on one stream', () => {
  it('number their changes as one sequence, after the cursor the client sent', async () => {
    const patching = (entity: typeof Item | typeof Tag) =>
      RemoteServer.live<string>(entity, {
        subscribe: ({ after }) =>
          Stream.make(
            {
              _tag: 'EntityPatched' as const,
              cursor: after + 1,
              entity: entity.name,
              id: 'x',
              values: {},
              changed: [],
            },
            { _tag: 'EntityDeleted' as const, cursor: after + 2, entity: entity.name, id: 'y' },
          ),
      })
    const server = RemoteServer.make({
      entities: [
        RemoteServer.entity<string>(Item, { read: () => Effect.succeed([]) }),
        RemoteServer.entity<string>(Tag, { read: () => Effect.succeed([]) }),
      ],
      live: [patching(Item), patching(Tag)],
    })
    const changes = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(RemoteRpc)
        return yield* client
          .FoldkitRemoteLive({
            version: REMOTE_PROTOCOL_VERSION,
            requirements: [
              { entity: 'Item', id: 'x', fields: ['name'] },
              { entity: 'Tag', id: 'x', fields: ['id'] },
            ],
            after: 7,
          })
          .pipe(Stream.take(4), Stream.runCollect)
      }).pipe(
        Effect.scoped,
        Effect.provide(RemoteRpc.toLayer(RemoteServer.handlers(server, 'ada'))),
      ),
    )
    expect(changes.map(change => change.cursor)).toEqual([8, 9, 10, 11])
    // Each source's changes keep their own order within the one sequence.
    expect(
      ['Item', 'Tag'].map(entity =>
        changes
          .filter(change => 'entity' in change && change.entity === entity)
          .map(change => change._tag),
      ),
    ).toEqual([
      ['EntityPatched', 'EntityDeleted'],
      ['EntityPatched', 'EntityDeleted'],
    ])
  })
})

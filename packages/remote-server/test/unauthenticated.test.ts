/**
 * A caller who could not be told, end to end: `serveFetch`'s resolver refuses
 * with `RemoteServer.unauthenticated`, the answer is a 401, and the client's
 * read, query and mutation alike fail with `_tag: 'Unauthenticated'` and the
 * reason, over JSON and over Effect RPC; a 401 from in front of Remote reads
 * the same, which a 403 there does not.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import {
  Mutation,
  Query,
  REMOTE_PROTOCOL_VERSION,
  Remote,
  RemoteRpc,
  RemoteUnauthenticated,
  type RemoteRpcClient,
} from 'foldkit-remote'
import { RpcSchema } from 'effect/rpc'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { serveFetch } from '../src/fetch.js'
import { RemoteServer } from '../src/index.js'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Items = Query.make('Items', { Input: {}, Result: Query.connection(Item) })
const Rename = Mutation.make('Rename', { Input: { id: Schema.String }, Output: {} })

const server = RemoteServer.make<string>({
  entities: [
    RemoteServer.entity(Item, {
      read: ({ ids }) => Effect.succeed(ids.map(id => ({ id, values: { name: 'Anchor' } }))),
    }),
  ],
  queries: [
    RemoteServer.query(Items, () =>
      Effect.succeed({
        edges: [],
        start: { _tag: 'Terminal' as const },
        end: { _tag: 'Terminal' as const },
      }),
    ),
  ],
  mutations: [RemoteServer.mutation(Rename, () => Effect.succeed({ output: {} }))],
})

// A request with a stale session is refused, with words for the person; one with none is a visitor.
const served = serveFetch({
  server,
  resolvePrincipal: request =>
    request.headers.get('x-session') === 'stale'
      ? Effect.fail(RemoteServer.unauthenticated('Your session ended.'))
      : Effect.succeed('visitor'),
  layer: () => Layer.empty,
})

const clientFor = (session: string, answer: typeof served = served): RemoteRpcClient =>
  Remote.http('http://worker.test/remote', {
    headers: () => ({ 'x-session': session }),
    fetch: (input, init) => answer(new Request(input, init), {}),
  })

const calls = {
  read: (client: RemoteRpcClient) =>
    client.FoldkitRemoteRead({
      version: REMOTE_PROTOCOL_VERSION,
      requests: [{ entity: 'Item', id: 'a', fields: ['name'] }],
    }),
  query: (client: RemoteRpcClient) =>
    client.FoldkitRemoteQuery({ query: 'Items', input: {}, window: {} }),
  mutate: (client: RemoteRpcClient) =>
    client.FoldkitRemoteMutate({ requestId: 'r1', mutation: 'Rename', input: { id: 'a' } }),
}

const failure = (call: Effect.Effect<unknown, unknown>) => Effect.runPromise(Effect.flip(call))

describe('a refused session over serveFetch and Remote.http', () => {
  it.each(Object.entries(calls))(
    'fails a %s as Unauthenticated, with its reason',
    async (_, call) => {
      expect(await failure(call(clientFor('stale')))).toMatchObject({
        _tag: 'Unauthenticated',
        message: 'Your session ended.',
        reason: 'Your session ended.',
      })
    },
  )

  it('answers a caller with no session as the visitor it resolved to', async () => {
    const read = await Effect.runPromise(calls.read(clientFor('none')))
    expect(read.entities).toEqual([{ entity: 'Item', id: 'a', values: { name: 'Anchor' } }])
  })

  it('shows on the Model: Data.mutation is Failed with the tag', async () => {
    const Model = Schema.Struct({ remote: Remote.Model })
    const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
    const Data = Remote.make({ model: App.model.remote, entities: [Item], mutations: [Rename] })
    const started = Data.mutate({ remote: Remote.initial }, Rename, { id: 'a' })
    const message = await Effect.runPromise(
      started.command.effect.pipe(Effect.provide(Remote.clientLayer(clientFor('stale')))),
    )
    expect(Data.mutation(Data.reduce(started.model, message), started.requestId)).toEqual({
      _tag: 'Failed',
      error: {
        _tag: 'Unauthenticated',
        message: 'Your session ended.',
        reason: 'Your session ended.',
      },
    })
  })
})

describe('a 401 from in front of Remote', () => {
  const answeringWith =
    (status: number, statusText: string): typeof served =>
    async () =>
      Response.json({ error: 'session expired' }, { status, statusText })

  it.each(Object.entries(calls))(
    'fails a %s as Unauthenticated, keeping the status',
    async (_, call) => {
      const failed = await failure(call(clientFor('any', answeringWith(401, 'Unauthorized'))))
      expect(failed).toMatchObject({ _tag: 'Unauthenticated', message: '401 Unauthorized' })
      expect(failed).not.toHaveProperty('reason')
    },
  )

  it('which a 403 there is not, for a read', async () => {
    expect(
      await failure(calls.read(clientFor('any', answeringWith(403, 'Forbidden')))),
    ).toMatchObject({ _tag: 'RemoteReadError', message: '403 Forbidden' })
  })
})

describe('a handler that could not tell who is asking', () => {
  const refusing: RemoteRpcClient = {
    FoldkitRemoteRead: () => Effect.fail(RemoteServer.unauthenticated('Sign in again.')),
    FoldkitRemoteQuery: () => Effect.fail(RemoteServer.unauthenticated()),
    FoldkitRemoteMutate: () => Effect.fail(RemoteServer.unauthenticated()),
    FoldkitRemoteLive: () => Stream.fail(RemoteServer.unauthenticated()),
  }

  it('is answered as a 401, as a refused resolver is', async () => {
    const read = { version: REMOTE_PROTOCOL_VERSION, requests: [] }
    expect(
      await Effect.runPromise(RemoteServer.answer(refusing, { operation: 'read', payload: read })),
    ).toEqual({
      status: 401,
      body: { error: 'Sign in again.', unauthenticated: { reason: 'Sign in again.' } },
    })
  })

  it.each(['FoldkitRemoteRead', 'FoldkitRemoteQuery', 'FoldkitRemoteMutate', 'FoldkitRemoteLive'])(
    'crosses Effect RPC from %s by the error schema a transport encodes with',
    async rpc => {
      const request = RemoteRpc.requests.get(rpc)!
      // A stream's failures are declared inside its success schema.
      const declared = RpcSchema.isStreamSchema(request.successSchema)
        ? request.successSchema.error
        : request.errorSchema
      const sent = await Effect.runPromise(
        Schema.encodeUnknownEffect(declared)(RemoteServer.unauthenticated('Sign in again.')).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(declared)),
        ),
      )
      expect(sent).toBeInstanceOf(RemoteUnauthenticated)
      expect(sent).toMatchObject({ reason: 'Sign in again.' })
    },
  )
})

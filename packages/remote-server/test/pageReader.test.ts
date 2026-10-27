/**
 * #212: a page render's reader in the same process. `pageReader` answers
 * from `serveFetch`'s own config, as the request's principal, resolved from
 * the request and what `layer` builds from the environment; it refuses a
 * principal as a 401 would, writes nothing, opens no stream, and closes its
 * layer when the read ends.
 */
import { Context, Effect, Layer, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Mutation, REMOTE_PROTOCOL_VERSION, Remote, RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { pageReader, serveFetch } from '../src/fetch.js'
import { RemoteServer } from '../src/index.js'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, name: Schema.String }))
const RenameItem = Mutation.make('RenameItem', {
  Input: { id: Schema.String, name: Schema.String },
  Output: { id: Schema.String },
})
const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const domain = Remote.make({ model: App.model.remote, entities: [Item], mutations: [RenameItem] })

type Principal = { readonly isAdmin: boolean }

const backend = RemoteServer.memory({
  domain,
  rows: { Item: [{ id: 'a', name: 'Anchor' }] },
  mutations: store => [
    RemoteServer.mutation(RenameItem, ({ input }) => {
      store.write('Item', input.id, { name: input.name })
      return Effect.succeed({ output: { id: input.id } })
    }),
  ],
  principal: { isAdmin: false },
  authorize: {
    Item: (principal: Principal, fields) =>
      fields.filter(field => field !== 'name' || principal.isAdmin),
  },
})

/** Who is signed in, as the environment's session store knows them: what `layer` builds. */
class Sessions extends Context.Service<Sessions, ReadonlyMap<string, Principal>>()(
  'test/Sessions',
) {}

interface Env {
  readonly sessions: ReadonlyMap<string, Principal>
  readonly closed: Array<string>
}

const remote = {
  server: backend.server,
  resolvePrincipal: (request: Request) =>
    Effect.flatMap(Sessions, sessions => {
      const session = request.headers.get('x-session')
      if (session === null) return Effect.succeed<Principal>({ isAdmin: false })
      const principal = sessions.get(session)
      return principal === undefined
        ? Effect.fail(RemoteServer.unauthenticated('Your session ended.'))
        : Effect.succeed(principal)
    }),
  layer: (env: Env) =>
    Layer.effect(
      Sessions,
      Effect.acquireRelease(Effect.succeed(env.sessions), () =>
        Effect.sync(() => env.closed.push('sessions')),
      ),
    ),
}

// Served over HTTP from the same config: the reader shares its server and layer.
serveFetch(remote)
const reader = pageReader(remote)

const env = (): Env => ({
  sessions: new Map([['s-ada', { isAdmin: true }]]),
  closed: [],
})

const page = (session?: string) =>
  new Request('http://worker.test/notes', {
    headers: session === undefined ? {} : { 'x-session': session },
  })

const readA = Effect.flatMap(RemoteClient, client =>
  client.read({
    version: REMOTE_PROTOCOL_VERSION,
    requests: [{ entity: 'Item', id: 'a', fields: ['name'] }],
  }),
)

describe('pageReader', () => {
  it('reads as the principal the request and its environment resolve to', async () => {
    const admin = await Effect.runPromise(readA.pipe(Effect.provide(reader(page('s-ada'), env()))))
    expect(admin).toEqual({
      entities: [{ entity: 'Item', id: 'a', values: { name: 'Anchor' } }],
      settled: [],
    })
    const visitor = await Effect.runPromise(readA.pipe(Effect.provide(reader(page(), env()))))
    expect(visitor).toEqual({
      entities: [],
      settled: [{ entity: 'Item', id: 'a', fields: ['name'] }],
    })
  })

  it("fails the read with the resolver's refusal", async () => {
    const refused = await Effect.runPromise(
      Effect.flip(readA.pipe(Effect.provide(reader(page('s-gone'), env())))),
    )
    expect(refused).toMatchObject({ _tag: 'Unauthenticated', reason: 'Your session ended.' })
  })

  it('writes nothing and opens no stream', async () => {
    const write = Effect.flatMap(RemoteClient, client =>
      client.mutate({
        requestId: 'page:1',
        mutation: 'RenameItem',
        input: { id: 'a', name: 'Anchor II' },
      }),
    )
    const refused = await Effect.runPromise(
      Effect.flip(write.pipe(Effect.provide(reader(page('s-ada'), env())))),
    )
    expect(refused).toMatchObject({
      _tag: 'RemoteMutationError',
      message: 'A page render reads; it does not write',
    })
    expect(backend.rows('Item')).toEqual([{ id: 'a', name: 'Anchor' }])

    const live = Effect.flatMap(RemoteClient, client =>
      Stream.runCollect(
        client.live({
          requirements: [{ entity: 'Item', id: 'a', fields: ['name'] }],
          after: 0,
        }),
      ),
    )
    const ended = await Effect.runPromise(
      Effect.flip(live.pipe(Effect.provide(reader(page('s-ada'), env())))),
    )
    expect(ended).toMatchObject({
      _tag: 'RemoteLiveError',
      message: 'A page render keeps no live stream',
    })
  })

  it('closes the layer it built when the read ends', async () => {
    const built = env()
    await Effect.runPromise(readA.pipe(Effect.provide(reader(page('s-ada'), built))))
    expect(built.closed).toEqual(['sessions'])
  })

  it("keeps serveFetch's limits", async () => {
    const readTwo = Effect.flatMap(RemoteClient, client =>
      client.read({
        version: REMOTE_PROTOCOL_VERSION,
        requests: [
          { entity: 'Item', id: 'a', fields: ['name'] },
          { entity: 'Item', id: 'b', fields: ['name'] },
        ],
      }),
    )
    const limited = pageReader({ ...remote, maxIdsPerEntity: 1 })
    const refused = await Effect.runPromise(
      Effect.flip(readTwo.pipe(Effect.provide(limited(page('s-ada'), env())))),
    )
    expect(refused).toMatchObject({ _tag: 'RemoteReadError' })
  })
})

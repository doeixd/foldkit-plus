import { Context, Effect, Layer, Schema } from 'effect'
import { Entity, Mutation, Query } from 'foldkit-remote'
import { serveFetch } from '../src/fetch.js'
import { RemoteServer } from '../src/index.js'

class Db extends Context.Service<Db, { readonly db: true }>()('test/Db') {}
class Cache extends Context.Service<Cache, { readonly cache: true }>()('test/Cache') {}

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))

const userSource = RemoteServer.entity<string, Db>(User, {
  read: ({ ids }) =>
    Effect.gen(function* () {
      yield* Db
      return ids.map(id => ({ id, values: {} }))
    }),
})

const Projects = Query.make('Projects', {
  Input: Schema.Struct({ ownerId: Schema.String }),
  Result: Query.connection({ name: 'Project' }),
})

const projectsSource = RemoteServer.query<string, Cache, { ownerId: string }>(Projects, () =>
  Effect.gen(function* () {
    yield* Cache
    return { edges: [], start: { _tag: 'Terminal' as const }, end: { _tag: 'Terminal' as const } }
  }),
)

type Requirements<Value> = Value extends Effect.Effect<any, any, infer R> ? R : never
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<Value extends true> = Value

// A source's requirement is not lost when it is the only service.
const single = RemoteServer.handlers(RemoteServer.make({ entities: [userSource] }), 'user')
type _single = Assert<Equals<Requirements<ReturnType<typeof single.FoldkitRemoteRead>>, Db>>

// Sources with different services need an explicit union; they cannot be
// inferred, because a single `R` would have to be one of them.
// @ts-expect-error Db and Cache are not the same requirement
RemoteServer.make({ entities: [userSource], queries: [projectsSource] })

const mixed = RemoteServer.handlers(
  RemoteServer.make<string, Db | Cache>({
    entities: [userSource],
    queries: [projectsSource],
  }),
  'user',
)
type _read = Assert<Equals<Requirements<ReturnType<typeof mixed.FoldkitRemoteRead>>, Db | Cache>>
type _query = Assert<Equals<Requirements<ReturnType<typeof mixed.FoldkitRemoteQuery>>, Db | Cache>>

// The common shape: a service-using entity beside a service-free mutation.
const Rename = Mutation.make('Rename', {
  Input: Schema.Struct({ id: Schema.String }),
  Output: Schema.Struct({ id: Schema.String }),
})
const renameSource = RemoteServer.mutation<string, never, 'Rename', { id: string }, { id: string }>(
  Rename,
  ({ input }) => Effect.succeed({ output: { id: input.id }, entities: [] }),
)

const common = RemoteServer.handlers(
  RemoteServer.make({ entities: [userSource], mutations: [renameSource] }),
  'user',
)
type _commonRead = Assert<Equals<Requirements<ReturnType<typeof common.FoldkitRemoteRead>>, Db>>
type _commonMutate = Assert<Equals<Requirements<ReturnType<typeof common.FoldkitRemoteMutate>>, Db>>

// A principal read from a Context key adds that key to what every handler needs.
class Asking extends Context.Service<Asking, string>()('test/Asking') {}
const provided = RemoteServer.handlers(RemoteServer.make({ entities: [userSource] }), Asking)
type _provided = Assert<
  Equals<Requirements<ReturnType<typeof provided.FoldkitRemoteRead>>, Db | Asking>
>

// A key must hold the server's principal.
class Numbered extends Context.Service<Numbered, number>()('test/Numbered') {}
// @ts-expect-error the key holds a number, the server answers as a string
RemoteServer.handlers(RemoteServer.make({ entities: [userSource] }), Numbered)

// serveFetch: the layer provides what the Sources need and what the resolver does.
class Sessions extends Context.Service<Sessions, { readonly who: string }>()('test/Sessions') {}
const resolving = () => Effect.map(Sessions, sessions => sessions.who)
serveFetch({
  server: RemoteServer.make({ entities: [userSource] }),
  resolvePrincipal: resolving,
  layer: () =>
    Layer.mergeAll(Layer.succeed(Db, { db: true }), Layer.succeed(Sessions, { who: 'a' })),
})
serveFetch({
  server: RemoteServer.make({ entities: [userSource] }),
  resolvePrincipal: resolving,
  // @ts-expect-error the layer leaves the resolver's Sessions out
  layer: () => Layer.succeed(Db, { db: true }),
})
serveFetch({
  server: RemoteServer.make({ entities: [userSource] }),
  // @ts-expect-error a resolver refuses with RemoteUnauthenticated, nothing else
  resolvePrincipal: () => Effect.fail(new Error('bad token')),
  layer: () => Layer.succeed(Db, { db: true }),
})

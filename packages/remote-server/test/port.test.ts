// @vitest-environment node
/**
 * Remote over a `MessagePort`: `foldkit-remote/port`'s client against
 * `foldkit-remote-server/port`'s server, over a bare `MessageChannel`. What a
 * page reads over it is what it reads in process; a handler's failure arrives
 * as the same Remote error; an interrupted call interrupts its handler; and
 * closing the client ends the serving.
 */
import { Deferred, Effect, Exit, Fiber, Option, Schema } from 'effect'
import { RpcClient } from 'effect/rpc'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Order, Relation } from 'foldkit-entity'
import {
  Query,
  QueryRequest,
  Remote,
  RemoteClient,
  RemoteQueryError,
  RemoteRpc,
} from 'foldkit-remote'
import { port, portProtocol } from 'foldkit-remote/port'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { RemoteServer } from '../src/index.js'
import { servePort } from '../src/port.js'

const UserBase = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const ProjectBase = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
)
const { User, Project } = Entity.relate(
  { User: UserBase, Project: ProjectBase },
  { Project: { owner: Relation.one(UserBase) } },
)
const ByStatus = Query.define('ByStatus', { status: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.status, input.status)),
    Query.orderBy(Order.asc(Project.fields.name)),
  ),
)
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [User, Project],
  queries: [ByStatus],
})
const initial: Model = { remote: Remote.initial }
const rows = {
  User: [{ id: 'u1', name: 'Ada' }],
  Project: [
    { id: 'p1', name: 'Borealis', status: 'active', owner: 'User:u1' },
    { id: 'p2', name: 'Apollo', status: 'active', owner: 'User:u1' },
  ],
}
const summary = Entity.select(Project, {
  name: true,
  owner: Entity.select(User, { name: true }),
})
const backend = RemoteServer.memory({ domain: Data, rows })
const handlers = RemoteServer.handlers(backend.server, undefined)

/** A page's client over a fresh channel, `served` answering at the other end, for `use`. */
const overPort = <A, E>(
  served: typeof handlers,
  use: Effect.Effect<A, E, RemoteClient>,
): Promise<{ readonly value: Exit.Exit<A, E>; readonly server: Fiber.Fiber<void, unknown> }> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const channel = new MessageChannel()
      const server = yield* Effect.forkDetach(servePort(served, channel.port2))
      const value = yield* Effect.exit(
        Effect.provide(
          use,
          port(() => channel.port1),
        ),
      )
      return { value, server }
    }),
  )

describe('Remote over a MessagePort', () => {
  it('reads an entity and a query page as in process', async () => {
    const reads = Effect.gen(function* () {
      const project = Data.get(summary, 'p1')
      const page = Data.query(ByStatus, { status: 'active' }, { select: summary, first: 1 })
      const model = yield* Data.prefetch(yield* Data.prefetch(initial, project), page)
      return [project.read(model), page.read(model)]
    })
    const inProcess = await Effect.runPromise(reads.pipe(Effect.provide(backend.layer)))
    const { value } = await overPort(handlers, reads)
    expect(value).toEqual(Exit.succeed(inProcess))
    expect(inProcess[0]).toMatchObject({ _tag: 'Ready', value: { name: 'Borealis' } })
  })

  it('carries a handler’s failure as the Remote error it is', async () => {
    const failing: typeof handlers = {
      ...handlers,
      FoldkitRemoteQuery: () => Effect.fail(new RemoteQueryError({ message: 'The store is down' })),
    }
    const page = Data.query(ByStatus, { status: 'active' }, { select: summary, first: 1 })
    const asked = Effect.map(Data.prefetch(initial, page), page.read)
    const inProcess = await Effect.runPromise(
      Effect.exit(asked.pipe(Effect.provide(Remote.clientLayer(failing)))),
    )
    const { value } = await overPort(failing, asked)
    expect(value).toEqual(inProcess)
    expect(JSON.stringify(value)).toContain('The store is down')
  })

  it('interrupts the handler when the call is interrupted', async () => {
    // Remote shares a query in flight between its waiters, so this asks the
    // RPC client itself, which interrupts the one call.
    const interrupted = Effect.runSync(Deferred.make<void>())
    const started = Effect.runSync(Deferred.make<void>())
    const hanging: typeof handlers = {
      ...handlers,
      FoldkitRemoteQuery: () =>
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
        ),
    }
    const request = Schema.decodeUnknownSync(QueryRequest)({
      query: 'ByStatus',
      input: { status: 'active' },
      window: { first: 1 },
    })
    const channel = new MessageChannel()
    const value = await Effect.runPromise(
      Effect.exit(
        Effect.gen(function* () {
          yield* Effect.forkScoped(servePort(hanging, channel.port2))
          const client = yield* RpcClient.make(RemoteRpc)
          const call = yield* Effect.forkChild(client.FoldkitRemoteQuery(request))
          yield* Deferred.await(started)
          yield* Fiber.interrupt(call)
          yield* Deferred.await(interrupted).pipe(Effect.timeout('2 seconds'))
        }).pipe(Effect.provide(portProtocol(() => channel.port1)), Effect.scoped),
      ),
    )
    expect(value).toEqual(Exit.void)
  })

  it('stops serving once the client closes its end', async () => {
    // One read, so the client has opened the conversation it then closes.
    const { server } = await overPort(handlers, Data.prefetch(initial, Data.get(summary, 'p1')))
    const ended = await Effect.runPromise(
      Fiber.await(server).pipe(Effect.timeout('2 seconds'), Effect.option),
    )
    expect(Option.isSome(ended)).toBe(true)
  })
})

/**
 * A Worker answering Remote through `serveFetch`, for
 * `workers.refusedBody.test.ts`: a call without the `x-csrf` header is
 * refused with a 401 before its body is read, `/ping` answers outside Remote.
 */
import { Effect, Layer, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { serveFetch } from 'foldkit-remote-server/fetch'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String }))
const Items = Query.make('Items', { Input: {}, Result: Query.connection(Item) })

const server = RemoteServer.make<string>({
  entities: [
    RemoteServer.entity(Item, {
      read: ({ ids }) => Effect.succeed(ids.map(id => ({ id, values: {} }))),
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
  mutations: [],
})

const remote = serveFetch({
  server,
  maxBodyBytes: 4096,
  resolvePrincipal: request =>
    request.headers.has('x-csrf')
      ? Effect.succeed('member')
      : Effect.fail(RemoteServer.unauthenticated('No CSRF header.')),
  layer: () => Layer.empty,
})

export default {
  fetch: (request: Request, env: unknown): Promise<Response> =>
    new URL(request.url).pathname === '/ping'
      ? Promise.resolve(new Response('pong'))
      : remote(request, env),
}

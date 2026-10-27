import { Context, Effect, Layer, Schema } from 'effect'
import {
  Entity,
  Remote,
  RemoteRpc,
  type RemoteClient,
  type RemoteUnauthenticated,
} from 'foldkit-remote'
import { pageReader, serveFetch } from '../src/fetch.js'
import { RemoteServer } from '../src/index.js'
import { servePort } from '../src/port.js'

const Project = Entity.make(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    privateNotes: Schema.String,
  }),
)

// Your authentication's principal type; without it `principal` is `unknown`.
type Principal = { readonly isAdmin: boolean }

const rows = new Map([['p1', { id: 'p1', name: 'Apollo', privateNotes: 'Internal' }]])

const ProjectSource = RemoteServer.entity<Principal>(Project, {
  // Authentication already resolved `principal` before RemoteServer sees it.
  // Return only fields this caller may read.
  authorize: (principal, fields) =>
    fields.filter(field => field !== 'privateNotes' || principal.isAdmin),

  read: ({ ids, fields }) =>
    Effect.succeed(
      ids.flatMap(id => {
        const row = rows.get(id)
        return row === undefined
          ? []
          : [
              {
                id,
                values: Object.fromEntries(
                  Object.entries(row).filter(([field]) => fields.includes(field)),
                ),
              },
            ]
      }),
    ),
})

const Server = RemoteServer.make({
  entities: [ProjectSource],
})

const principal: Principal = { isAdmin: false }
const handlers = RemoteServer.handlers(Server, principal)
const layer = RemoteRpc.toLayer(handlers)

void layer

// Over plain JSON.
// A fetch-style route (Bun, Deno, a Worker; Node through its own adapter).
const route = async (request: Request): Promise<Response> => {
  const body: unknown = await request.json().catch(() => null)
  const answered = await Effect.runPromise(RemoteServer.answer(handlers, body))
  return Response.json(answered.body, { status: answered.status })
}

void route

// Over a MessagePort: in the host, for each port a page hands it.
declare const port: MessagePort
const served: Effect.Effect<void, unknown> = servePort(handlers, port)
void served

// A backend held in memory, authorized per principal.
const Data = Remote.define({ entities: [Project] })
const guarded = RemoteServer.memory({
  domain: Data,
  rows: { Project: [{ id: 'p1', name: 'Apollo', privateNotes: 'Internal' }] },
  principal: { isAdmin: false },
  authorize: {
    Project: (principal: Principal, fields) =>
      fields.filter(field => field !== 'privateNotes' || principal.isAdmin),
  },
})
const asAdmin = RemoteServer.handlers(guarded.server, { isAdmin: true })
void asAdmin

// Only an admin reads projects.
const adminsOnly = RemoteServer.memory({
  domain: Data,
  rows: { Project: [{ id: 'p1', name: 'Apollo', privateNotes: 'Internal' }] },
  principal: { isAdmin: false },
  readable: (principal: Principal) =>
    Effect.succeed(entity => principal.isAdmin || entity !== 'Project'),
})
void adminsOnly

// An entity no row backs, beside the rows; no principal, so no layer.
const Whoami = Entity.make('Whoami', Schema.Struct({ id: Schema.String, admin: Schema.Boolean }))
const WhoamiSource = RemoteServer.entity<Principal>(Whoami, {
  read: ({ ids, principal }) =>
    Effect.succeed(ids.map(id => ({ id, values: { admin: principal.isAdmin } }))),
})

// No principal: served through `serveFetch` or `handlers`, as each request's.
const { server: beside } = RemoteServer.memory({
  domain: Data, // Project only; Whoami is the Source's
  rows: { Project: [{ id: 'p1', name: 'Apollo', privateNotes: 'Internal' }] },
  entities: [WhoamiSource],
})
const asVisitor = RemoteServer.handlers(beside, { isAdmin: false })
void asVisitor

// Who is asking, read on each call: one handler set answers every request.
class CurrentUser extends Context.Service<CurrentUser, Principal>()('app/CurrentUser') {}
const answering = RemoteServer.handlers(Server, CurrentUser)
const routeAs = async (request: Request, user: Principal): Promise<Response> => {
  const body: unknown = await request.json().catch(() => null)
  const answered = await Effect.runPromise(
    RemoteServer.answer(answering, body).pipe(Effect.provideService(CurrentUser, user)),
  )
  return Response.json(answered.body, { status: answered.status })
}
void routeAs

// Everyone reads a project's name alike; only an admin reads its private notes.
const SharedProjectSource = RemoteServer.entity<Principal>(Project, {
  authorize: ProjectSource.authorize,
  read: ProjectSource.read,
  shared: ['name'],
})
void SharedProjectSource

// Two requests by one person share a live re-read.
const byPerson = RemoteServer.liveHub([ProjectSource], {
  key: (user: Principal) => (user.isAdmin ? 'admin' : 'member'),
})
void byPerson

// ## A page's reads, in the same process: `pageReader`
{
  interface Env {
    readonly DB: unknown
  }
  class Database extends Context.Service<Database, unknown>()('readme/Database') {}
  const server = RemoteServer.make<Principal, Database>({ entities: [] })
  const drizzle = (db: unknown) => db
  const databaseLayer = (db: unknown) => Layer.succeed(Database, db)
  const resolvePrincipal = (request: Request) =>
    Effect.succeed<Principal>({ isAdmin: request.headers.has('x-admin') })
  const resolvePage = () => Effect.succeed<Principal>({ isAdmin: false })
  const PageContext = {
    attach: (
      request: Request,
      _: { readonly reader: Layer.Layer<RemoteClient, RemoteUnauthenticated> },
    ) => request,
  }
  const pages = { fetch: (request: Request) => Promise.resolve(new Response(request.url)) }

  const remote = { server, resolvePrincipal, layer: (env: Env) => databaseLayer(drizzle(env.DB)) }
  const served = serveFetch(remote)
  const reader = pageReader({ ...remote, resolvePrincipal: resolvePage })

  const worker = {
    fetch: (request: Request, env: Env) =>
      new URL(request.url).pathname === '/remote'
        ? served(request, env)
        : pages.fetch(PageContext.attach(request, { reader: reader(request, env) })),
  }
  void worker
}

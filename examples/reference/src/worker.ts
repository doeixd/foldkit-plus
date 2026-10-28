/**
 * The Worker: one fetch handler for the whole application.
 *
 * - `/assets/…` is the page's build, from the assets binding.
 * - `/auth/…` is Yielded's routes: sign up, sign in, sign out.
 * - `/remote` is Remote: reads, writes and live streams over D1, as the
 *   reader the session cookie names.
 * - Every other request is a page, rendered here as that reader into the
 *   build's `index.html`, read in this process (`pageReader`).
 *
 * Auth's services are built once per isolate: a D1 binding is not I/O a
 * request owns, and built per request Yielded's first-use setup races
 * itself. The origin each request is checked against is its own: the URL a
 * Worker is given is the route Cloudflare matched, for a host this account
 * serves.
 */
import type { D1Database } from '@cloudflare/workers-types'
import * as D1Client from '@effect/sql-d1/D1Client'
import { Http } from '@yielded/auth'
import * as WorkerdServices from '@yielded/auth/WorkerdServices'
import { drizzle } from 'drizzle-orm/d1'
import { Duration, Effect, Layer, ManagedRuntime, Option, type Context } from 'effect'
import { HttpRouter, HttpServer } from 'effect/http'
import { handleRequest } from 'foldkit/experimental/server'
import { AuthServer } from 'foldkit-plus/auth/server'
import { databaseLayer } from 'foldkit-plus/remote-drizzle'
import { RemoteServer } from 'foldkit-plus/remote-server'
import { pageReader, serveFetch } from 'foldkit-plus/remote-server/fetch'
import { App, AppServices } from './auth.js'
import { buildIdOf } from './build.js'
import type { Principal } from './guard.js'
import { PageContext, makeRenderPage } from './page.js'
import { Policy, server } from './server.js'

/**
 * The assets binding, as the Worker calls it. `@cloudflare/workers-types`'
 * own `Fetcher` takes its `Request`, not the one this module's handlers make.
 */
export interface Assets {
  readonly fetch: (request: Request | string) => Promise<Response>
}

export interface WorkerEnv {
  readonly DB: D1Database
  readonly ASSETS: Assets
}

/** Remembers what `make` built for a key; a build that failed is forgotten, so the next asks again. */
const memo = <K, A>(make: (key: K) => Promise<A>) => {
  const built = new Map<K, Promise<A>>()
  return (key: K): Promise<A> => {
    const held = built.get(key)
    if (held !== undefined) return held
    const building = make(key)
    built.set(key, building)
    building.catch(() => built.delete(key))
    return building
  }
}

/** Yielded's services over this isolate's database. Kept for the isolate's life, so never disposed. */
const authServices = memo(async (db: D1Database) => {
  const runtime = ManagedRuntime.make(
    AppServices.pipe(
      Layer.provideMerge(WorkerdServices.layer),
      Layer.provide(D1Client.layer({ db })),
      Layer.orDie,
    ),
  )
  return runtime.context()
})

/** Who a session is: a member whose account is active, read fresh per request. */
const principalOf = (db: D1Database) => (session: { readonly subjectId: string }) =>
  Effect.promise(() =>
    db
      .prepare("SELECT id FROM accounts WHERE id = ? AND status = 'active'")
      .bind(session.subjectId)
      .first<Principal>(),
  ).pipe(
    Effect.flatMap(row =>
      row === null
        ? Effect.fail(RemoteServer.unauthenticated('No such account.'))
        : Effect.succeed({ id: row.id }),
    ),
  )

/** Everything that answers for one origin: Yielded's routes, Remote, and a page's reader. */
type AuthServices =
  Awaited<ReturnType<typeof authServices>> extends Context.Context<infer S> ? S : never

const hostFor = (services: Context.Context<AuthServices>, db: D1Database, origin: string) => {
  const shared = Layer.succeedContext(services)
  const http = { origin } as const
  const routes = HttpRouter.toWebHandler(
    Http.make(App, http)
      .routes()
      // A Worker has no file system; nothing here serves a file.
      .pipe(Layer.provide([shared, HttpServer.layerServices]), Layer.orDie),
    { disableLogger: true },
  )
  // `key` names the principal as `Me` does, for the answer's header and the check of it.
  const resolving = { auth: App, http, principal: principalOf(db), key: Policy.key }
  const remote = {
    server,
    resolvePrincipal: AuthServer.resolver(resolving),
    headers: AuthServer.answered(resolving),
    layer: (env: WorkerEnv) => Layer.merge(shared, databaseLayer(drizzle(env.DB))),
    // A live stream asks again who it serves: a sign-out in another tab ends it.
    revalidate: { every: Duration.seconds(5), key: Policy.keyOf },
  }
  return {
    auth: routes.handler,
    remote: serveFetch(remote),
    // A page request is a navigation, which carries no CSRF header; its reader cannot write.
    read: pageReader({
      ...remote,
      resolvePrincipal: AuthServer.resolver({ ...resolving, requests: 'navigation' }),
    }),
  }
}

type Host = ReturnType<typeof hostFor>

const hosts = new Map<string, Host>()

const hostOf = async (env: WorkerEnv, origin: string): Promise<Host> => {
  const held = hosts.get(origin)
  if (held !== undefined) return held
  const host = hostFor(await authServices(env.DB), env.DB, origin)
  hosts.set(origin, host)
  return host
}

/** The build's `index.html`, and the id it carries; read once per isolate. */
const templateOf = memo(async (assets: Assets) => {
  const response = await assets.fetch('https://assets.invalid/index.html')
  if (!response.ok)
    throw new Error(`The assets hold no index.html (${response.status}): run vite build`)
  const html = await response.text()
  const buildId = Option.getOrThrowWith(
    buildIdOf(html),
    () => new Error('index.html carries no build id: build it with this vite.config.ts'),
  )
  return { html, renderPage: makeRenderPage(buildId) }
})

const answerPage = async (request: Request, env: WorkerEnv, host: Host): Promise<Response> => {
  const { html, renderPage } = await templateOf(env.ASSETS)
  return handleRequest(PageContext.attach(request, { reader: host.read(request, env) }), {
    renderPage,
    template: html,
  })
}

export default {
  fetch: async (request: Request, env: WorkerEnv): Promise<Response> => {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/assets/')) return env.ASSETS.fetch(request)
    const host = await hostOf(env, url.origin)
    if (url.pathname.startsWith('/auth/')) return host.auth(request)
    if (url.pathname === '/remote') return host.remote(request, env)
    return answerPage(request, env, host)
  },
}

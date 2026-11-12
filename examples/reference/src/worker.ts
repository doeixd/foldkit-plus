/**
 * The Worker: one fetch handler for the whole application, in `Host.routes`'
 * order.
 *
 * - `/assets/…` is the page's build, from the assets binding.
 * - `/auth/…` is Yielded's routes: sign up, sign in, sign out.
 * - `/remote` is Remote: reads, writes and live streams over D1, as the
 *   reader the session cookie names.
 * - Every other request is a page, rendered here as that reader into the
 *   build's `index.html`, read in this process (`pageReader`).
 *
 * Auth's services are built once per isolate (`Host.isolate`): a D1 binding
 * is not I/O a request owns, and built per request Yielded's first-use setup
 * races itself. Every request is checked against one configured origin
 * (`ORIGIN`), not the host it arrived at: a Worker reachable at a second
 * host (`workers.dev` beside a domain) trusts only the one it is told.
 */
import type { D1Database } from '@cloudflare/workers-types'
import * as D1Client from '@effect/sql-d1/D1Client'
import * as WorkerdServices from '@yielded/auth-platform-workerd'
import { drizzle } from 'drizzle-orm/d1'
import { Duration, Effect, Layer, ManagedRuntime } from 'effect'
import { handleRequest, injectIntoTemplate } from 'foldkit/experimental/server'
import { AuthServer } from 'foldkit-plus/auth/server'
import { Host } from 'foldkit-plus/host'
import { databaseLayer } from 'foldkit-plus/remote-drizzle'
import { RemoteServer } from 'foldkit-plus/remote-server'
import { pageReader, serveFetch } from 'foldkit-plus/remote-server/fetch'
import { SSR } from 'foldkit-plus/ssr'
import { App, AppServices } from './auth.js'
import type { Principal } from './guard.js'
import { PageContext, makeRenderPage } from './page.js'
import { Policy, server } from './server.js'

export interface WorkerEnv {
  readonly DB: D1Database
  readonly ASSETS: Host.Assets
  /**
   * Where the application is served; a scripted call's `Origin` must name it.
   * A deploy sets it in `[vars]`; the local stack gives its own.
   */
  readonly ORIGIN?: string
}

/** `WorkerEnv` once `Host.routes` has checked `ORIGIN` is set. */
type Served = Host.Configured<WorkerEnv, 'ORIGIN'>

/**
 * Who a session is: a member, read fresh per request. Yielded has already
 * refused a session whose account is not active.
 */
const principalOf = (db: D1Database) => (session: { readonly subjectId: string }) =>
  Effect.promise(() =>
    db.prepare('SELECT id FROM accounts WHERE id = ?').bind(session.subjectId).first<Principal>(),
  ).pipe(
    Effect.flatMap(row =>
      row === null
        ? Effect.fail(RemoteServer.unauthenticated('No such account.'))
        : Effect.succeed({ id: row.id }),
    ),
  )

const remote = {
  server,
  layer: (env: WorkerEnv) => databaseLayer(drizzle(env.DB)),
  // A live stream asks again who it serves: a sign-out in another tab ends it.
  revalidate: { every: Duration.seconds(5), key: Policy.keyOf },
}

/**
 * Everything that answers for the origin, over this isolate's database:
 * Yielded's routes, Remote, and a page's reader. Yielded's services are kept
 * for the isolate's life, so never disposed; the principal is read per request.
 * `ORIGIN` comes with the bindings (a reload replaces both), so it is read here.
 */
const hostOf = Host.isolate(
  (env: Served) => env.DB,
  async env => {
    const services = await ManagedRuntime.make(
      AppServices.pipe(
        Layer.provideMerge(WorkerdServices.layer),
        Layer.provide(D1Client.layer({ db: env.DB })),
        Layer.orDie,
      ),
    ).context()
    const auth = AuthServer.host({
      auth: App,
      http: { origin: env.ORIGIN },
      services,
      principal: principalOf(env.DB),
      // Names the principal as `Me` does, for the answer's header and the check of it.
      key: Policy.key,
    })
    return {
      auth: auth.routes,
      remote: serveFetch({ ...remote, ...auth.scripted }),
      // A page request is a navigation, which carries no CSRF header; its reader cannot write.
      read: pageReader({ ...remote, ...auth.navigation }),
    }
  },
)

const template = Host.template((env: WorkerEnv) => env.ASSETS)

/** The build's template and the entry for its build id, once per isolate. */
const pagesOf = Host.isolate(
  (env: WorkerEnv) => env.ASSETS,
  async env => {
    const { html, buildId } = await template(env)
    return { html, renderPage: makeRenderPage(buildId) }
  },
)

export default {
  fetch: Host.routes({
    origin: 'ORIGIN',
    assets: { at: '/assets/', binding: (env: WorkerEnv) => env.ASSETS },
    routes: {
      '/auth/': async (request, env) => (await hostOf(env)).auth(request),
      '/remote': async (request, env) => (await hostOf(env)).remote(request, env),
    },
    otherwise: async (request, env) => {
      const [host, { html, renderPage }] = await Promise.all([hostOf(env), pagesOf(env)])
      return handleRequest(PageContext.attach(request, { reader: host.read(request, env) }), {
        renderPage,
        // The page's `meta` rides in its root; `SSR.headed` moves it into the head.
        renderDocument: SSR.headed(application => injectIntoTemplate(html, application)),
      })
    },
  }),
}

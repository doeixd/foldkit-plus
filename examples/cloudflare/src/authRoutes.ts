/**
 * Yielded Auth's routes (`/auth/…`) and `/me` over D1. `authOf` builds them
 * once per isolate: a D1 binding is not I/O a request owns, and a rebuild per
 * request would repeat Yielded's first-use setup on every call. Workers only:
 * `WorkerdServices` imports a Wasm module Node cannot load.
 */
import * as D1Client from '@effect/sql-d1/D1Client'
import type { D1Database } from '@cloudflare/workers-types'
import { Http } from '@yielded/auth'
import * as WorkerdServices from '@yielded/auth-platform-workerd'
import { Cause, Effect, Exit, Layer, ManagedRuntime, Option } from 'effect'
import { HttpRouter, HttpServer } from 'effect/http'
import { AuthServer } from 'foldkit-auth/server'
import { RemoteServer } from 'foldkit-remote-server'
import { App, AppServices } from './auth.js'

/** Who `/me` says a session is. */
export interface Account {
  readonly id: string
  readonly email: string
  readonly displayName: string
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * Yielded's routes and `/me` over one D1 database, for a page at `origin`:
 * Yielded trusts a sign-in from it, and the resolver reads a cookie only from
 * a request that shows it came from there.
 */
export const authOf = async (db: D1Database, origin: string) => {
  const http = { origin } as const
  const runtime = ManagedRuntime.make(
    AppServices.pipe(
      Layer.provideMerge(WorkerdServices.layer),
      Layer.provide(D1Client.layer({ db })),
      Layer.orDie,
    ),
  )
  const shared = Layer.succeedContext(await runtime.context())
  const routes = HttpRouter.toWebHandler(
    Http.make(App, http)
      .routes()
      // A Worker has no file system; nothing here serves a file.
      .pipe(Layer.provide([shared, HttpServer.layerServices]), Layer.orDie),
    { disableLogger: true },
  )
  // Read fresh per request, never taken from the session's claims.
  const accountOf = (session: { readonly subjectId: string }) =>
    Effect.promise(() =>
      db
        .prepare('SELECT id, email, display_name AS displayName FROM accounts WHERE id = ?')
        .bind(session.subjectId)
        .first<Account>(),
    ).pipe(
      Effect.flatMap(row =>
        row === null
          ? Effect.fail(RemoteServer.unauthenticated('No such account.'))
          : Effect.succeed(row),
      ),
    )
  const resolve = AuthServer.resolver({ auth: App, http, principal: accountOf })
  /** `{ account }`, `null` for a visitor; a refused cookie is a 401 saying why. */
  const me = async (request: Request): Promise<Response> => {
    const exit = await runtime.runPromiseExit(resolve(request))
    return Exit.match(exit, {
      onSuccess: account => json(200, { account: Option.getOrNull(account) }),
      // A refusal is the caller's; anything else (the store failing) is a defect.
      onFailure: cause =>
        Option.match(Cause.findErrorOption(cause), {
          onNone: () => {
            throw Cause.squash(cause)
          },
          onSome: refused => json(401, { error: refused.reason }),
        }),
    })
  }
  // Kept for the isolate's life, so never disposed.
  return { auth: routes.handler, me }
}

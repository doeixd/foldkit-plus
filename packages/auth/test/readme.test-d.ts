/**
 * Every TypeScript snippet of this package's README, as one module, so the
 * documentation cannot drift from the API. What the README leaves to the
 * reader is declared here: the Yielded application, its Layer, and the
 * Remote server.
 */
import { Auth, AuthContract, Password, Sessions } from '@yielded/auth'
import { Context, Effect, Layer, type Option, Schema } from 'effect'
import { Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { serveFetch } from 'foldkit-remote-server/fetch'
import { SSR } from 'foldkit-ssr'
import { defineDocumentHost, type DocumentHostConfig } from 'foldkit-sync/do'
import { believing } from 'foldkit-auth'
import { AuthServer } from 'foldkit-auth/server'

const AppAuth = Auth.make(
  AuthContract.make('readme/Auth', {
    claims: Schema.Struct({}),
    actions: sessions => ({ signIn: AuthContract.passwordSignIn(sessions) }),
  }),
  {
    sessions: Sessions.stateful({ idleTimeout: '10 minutes', maxAge: '1 hour' }),
    strategies: { password: Password.make() },
    defaultStrategy: 'password',
  },
)
declare const AppAuthLive: Layer.Layer<Context.Service.Identifier<typeof AppAuth>>
const server = RemoteServer.make<Option.Option<{ readonly id: string }>>({ entities: [] })

// ## Sixty seconds

const http = { origin: 'https://app.example' } as const // the options given Http.make(AppAuth, http)

export const remote = serveFetch({
  server,
  resolvePrincipal: AuthServer.resolver({
    auth: AppAuth, // Auth.make(…)
    http,
    principal: session => Effect.succeed({ id: session.subjectId }),
  }),
  layer: () => AppAuthLive, // AppAuth.layer, with its persistence
})

// ## The client's side

export const transport = Remote.httpWithLive('/remote', {
  headers: () => ({ 'x-effect-auth-csrf': '1' }),
})

// ## Who the client believes it is

declare const Policy: { readonly key: (user: { readonly id: string }) => string }
const principal = (session: { readonly subjectId: string }) =>
  Effect.succeed({ id: session.subjectId })

const resolving = { auth: AppAuth, http, principal, key: Policy.key }
export const echoing = serveFetch({
  server,
  resolvePrincipal: AuthServer.resolver(resolving),
  headers: AuthServer.answered(resolving), // `x-foldkit-subject` on each answer
  layer: () => AppAuthLive,
})

// The browser: Remote's transport through a fetch that repeats it.
export const belief = believing()
export const believingTransport = Remote.httpWithLive('/remote', {
  headers: () => ({ 'x-effect-auth-csrf': '1' }),
  fetch: belief.fetch,
})

// ## Sync's socket

class DurableObject {
  constructor(_ctx: unknown, _env: unknown) {}
}
type HostConfig = DocumentHostConfig<
  unknown,
  unknown,
  Option.Option<{ readonly id: string }>,
  unknown
>
declare const sync: HostConfig['sync']
declare const openJournal: HostConfig['openJournal']

export class SyncHost extends defineDocumentHost(DurableObject, {
  sync, // Sync.make(…)
  openJournal,
  resolvePrincipal: AuthServer.resolver({
    requests: 'browser',
    auth: AppAuth,
    http,
    principal: session => Effect.succeed({ id: session.subjectId }),
  }),
  layer: () => AppAuthLive,
  revalidate: { every: '1 minute' },
}) {}

// ## SSR's posted forms

// The page's config and plan, as foldkit-ssr's README builds them.
declare const config: Parameters<typeof SSR.entry>[0]
declare const plan: Parameters<typeof SSR.entry>[1]

class Principal extends Context.Service<Principal, Option.Option<{ readonly id: string }>>()(
  'app/Principal',
) {}
const whoPosted = AuthServer.resolver({
  requests: 'browser',
  auth: AppAuth,
  http,
  principal: session => Effect.succeed({ id: session.subjectId }),
})

export const entry = SSR.entry(config, plan, {
  buildId: 'b1',
  origins: [http.origin],
  resources: request =>
    Layer.effect(Principal, whoPosted(request)).pipe(Layer.provide(AppAuthLive), Layer.orDie),
})

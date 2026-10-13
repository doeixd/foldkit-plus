/**
 * Every TypeScript snippet of this package's README, as one module, so the
 * documentation cannot drift from the API. What the README leaves to the
 * reader is declared here: the Yielded application, its Layer, and the
 * Remote server.
 */
import { Auth, AuthContract, Password, Sessions } from '@yielded/auth'
import { type Context, Effect, type Layer, type Option, Schema } from 'effect'
import { Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { serveFetch } from 'foldkit-remote-server/fetch'
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

/** What `AuthServer.resolver` accepts and what it says it needs. */
import { Auth, AuthContract, Password, Sessions } from '@yielded/auth'
import { Context, Effect, type Layer, Option, Schema } from 'effect'
import type { RemoteUnauthenticated } from 'foldkit-remote'
import { AuthServer } from 'foldkit-auth/server'
import { defineDocumentHost, type DocumentHostConfig } from 'foldkit-sync/do'
import { describe, expectTypeOf, it } from 'vitest'

const AppAuth = Auth.make(
  AuthContract.make('types/Auth', {
    claims: Schema.Struct({}),
    actions: sessions => ({ signIn: AuthContract.passwordSignIn(sessions) }),
  }),
  {
    sessions: Sessions.stateful({ idleTimeout: '10 minutes', maxAge: '1 hour' }),
    strategies: { password: Password.make() },
    defaultStrategy: 'password',
  },
)
const http = { origin: 'https://app.example' }
class Users extends Context.Service<
  Users,
  { readonly find: (id: string) => Effect.Effect<string> }
>()('types/Users') {}

describe('AuthServer.resolver', () => {
  it('needs the Auth service and what `principal` needs, and fails only with a refusal', () => {
    const resolve = AuthServer.resolver({
      auth: AppAuth,
      http,
      principal: session => Effect.flatMap(Users, users => users.find(session.subjectId)),
    })
    type Resolved = ReturnType<typeof resolve>
    expectTypeOf<Effect.Success<Resolved>>().toEqualTypeOf<Option.Option<string>>()
    expectTypeOf<Effect.Error<Resolved>>().toEqualTypeOf<RemoteUnauthenticated>()
    expectTypeOf<Effect.Services<Resolved>>().toEqualTypeOf<
      Context.Service.Identifier<typeof AppAuth> | Users
    >()
  })

  it('refuses a principal that fails with anything but a refusal', () => {
    AuthServer.resolver({
      auth: AppAuth,
      http,
      // @ts-expect-error a failure the host cannot answer as a 401
      principal: () => Effect.fail(new Error('no')),
    })
  })

  it('refuses a service that cannot verify a session', () => {
    AuthServer.resolver({
      // @ts-expect-error Users verifies nothing
      auth: Users,
      http,
      principal: () => Effect.succeed('ada'),
    })
  })

  it('refuses options without an origin to trust', () => {
    AuthServer.resolver({
      auth: AppAuth,
      // @ts-expect-error no origin
      http: { trustedOrigins: ['https://app.example'] },
      principal: () => Effect.succeed('ada'),
    })
  })
})

type SocketUser = { readonly id: string }
type HostConfig = DocumentHostConfig<unknown, unknown, Option.Option<SocketUser>, unknown>
// A document's contract and journal, and the application's Auth layer: never run here.
declare const host: Pick<HostConfig, 'sync' | 'openJournal'>
declare const AppAuthLive: Layer.Layer<Context.Service.Identifier<typeof AppAuth>>

describe('AuthServer.socket', () => {
  class Base {
    constructor(_ctx: unknown, _env: unknown) {}
  }
  const socket = AuthServer.socket({
    auth: AppAuth,
    http,
    principal: session => Effect.succeed<SocketUser>({ id: session.subjectId }),
  })

  it("is a document host's resolver, with the layer that provides Auth", () => {
    defineDocumentHost(Base, { ...host, resolvePrincipal: socket, layer: () => AppAuthLive })
  })

  it('needs that layer', () => {
    // @ts-expect-error nothing provides the Auth service
    defineDocumentHost(Base, { ...host, resolvePrincipal: socket })
  })
})

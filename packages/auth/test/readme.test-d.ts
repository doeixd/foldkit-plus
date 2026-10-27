/**
 * Every TypeScript snippet of this package's README, as one module, so the
 * documentation cannot drift from the API. What the README leaves to the
 * reader is declared here: the Yielded application, its Layer, and the
 * Remote server.
 */
import { Auth, AuthContract, EmailDelivery, Password, Sessions } from '@yielded/auth'
import * as Client from '@yielded/auth/Client'
import { Email } from '@yielded/auth/Schema'
import type { WorkerdServices } from '@yielded/auth/WorkerdServices'
import { AuthPersistence } from '@yielded/auth-persistence'
import { Context, Effect, Layer, type Option, Redacted, Schema } from 'effect'
import { Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { pageReader, serveFetch } from 'foldkit-remote-server/fetch'
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

// ## SSR's page reads
{
  const resolving = { auth: AppAuth, http, principal }
  const reader = pageReader({
    server,
    resolvePrincipal: AuthServer.resolver({ ...resolving, requests: 'navigation' }),
    layer: () => AppAuthLive,
  })
  void reader
}

// ## Signing up
// Its own block: the section names its contract and service as the others do.
{
  /** What sign-up asks beyond an email and a password: the application's own fields. */
  const Registration = Schema.Struct({ displayName: Schema.NonEmptyString })

  const AuthApi = AuthContract.make('app/Auth', {
    claims: Schema.Struct({}),
    actions: sessions => ({
      signIn: AuthContract.passwordSignIn(sessions),
      register: AuthContract.action({
        payload: Schema.Struct({
          requestId: Password.PasswordCommandId,
          email: Email,
          newPassword: Schema.RedactedFromValue(Schema.String),
          registration: Registration,
        }),
        success: Schema.TaggedStruct('RegistrationAccepted', {}),
        error: Schema.Union([
          Password.NewPasswordRejected,
          Password.PasswordCheckUnavailable,
          Password.PasswordRejected,
          Password.PasswordUnavailable,
          Password.PasswordMethodUnsupported,
          Password.PasswordActionRequired,
        ]),
        mode: 'mutation',
        replay: 'idempotent',
      }),
    }),
  })

  const AppAuth = Auth.make(AuthApi, {
    sessions: Sessions.stateful({ idleTimeout: '1 hour', maxAge: '1 day' }),
    strategies: {
      password: Password.make({
        registration: Registration,
        reset: Password.resetLink({ url: 'https://app.example/reset' }),
      }),
    },
    defaultStrategy: 'password',
  })

  const Persistence = AuthPersistence.make(AppAuth)

  const Provisioning = Layer.succeed(Persistence.Provisioning, {
    password: {
      values: ({ identifier, registration }) =>
        Effect.sync(() => ({
          id: crypto.randomUUID(),
          status: 'active', // the subject table's `activeValue`
          securityRevision: crypto.randomUUID(),
          email: identifier.value,
          displayName: registration.displayName,
        })),
    },
  })

  const common = new Set(['password password', 'correct horse battery staple'])

  const PasswordOnly = Layer.mergeAll(
    Layer.succeed(Password.CompromisedPasswords, {
      check: password =>
        Effect.succeed(
          common.has(Redacted.value(password))
            ? { _tag: 'Rejected', reason: 'common' }
            : { _tag: 'Allowed' },
        ),
    }),
    Layer.succeed(Password.PasswordActionEvidence, {
      verify: () => Effect.fail(Password.PasswordActionRequired.make({})),
    }),
    Layer.succeed(EmailDelivery.EmailDelivery, {
      send: () => Effect.fail(EmailDelivery.EmailNotAccepted.make({})),
    }),
  )

  // The prose's claim: once both are given, what is left is sign-in's own.
  type Left = Exclude<
    Layer.Services<typeof AppAuth.layer>,
    Layer.Success<typeof PasswordOnly> | Layer.Success<typeof Persistence.layer>
  >
  const onlySignInNeeds: [Left] extends [
    WorkerdServices | Context.Service.Identifier<typeof AppAuth.strategies.password.SessionClaims>,
  ]
    ? true
    : false = true
  // and `Persistence.layer` asks for `Provisioning`.
  const persistenceNeeds: [Layer.Success<typeof Provisioning>] extends [
    Layer.Services<typeof Persistence.layer>,
  ]
    ? true
    : false = true

  const AppClient = Client.make(AuthApi, { baseUrl: location.origin })

  const signUp = (form: {
    readonly requestId: string // one per submission, handed to `values` as `requestId`
    readonly email: string
    readonly password: Redacted.Redacted<string>
    readonly displayName: string
  }) =>
    Effect.gen(function* () {
      const { auth } = yield* AppClient
      yield* auth.register({
        requestId: form.requestId,
        email: form.email,
        newPassword: Redacted.value(form.password),
        registration: { displayName: form.displayName },
      })
      return yield* auth.signIn({ email: form.email, password: Redacted.value(form.password) })
    })
  void [onlySignInNeeds, persistenceNeeds, signUp]
}

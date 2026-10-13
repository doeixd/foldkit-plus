// @vitest-environment node
/**
 * A Yielded Auth session as the principal Remote answers as, end to end:
 * Yielded's own routes sign a reader in and set the cookie; `serveFetch`,
 * resolving with `AuthServer.resolver` from the same `Http.make` options,
 * reads it back. No cookie is a visitor; a request that cannot show it came
 * from the application reads as one too; a cookie that no longer verifies,
 * or a client that believes it is someone else, is a 401.
 */
import { AuthContract, Auth, Http, Password, Sessions } from '@yielded/auth'
import * as Testing from '@yielded/auth-persistence/Testing'
import { NodeHttpServer } from '@effect/platform-node'
import { Context, Effect, Exit, Layer, Option, Redacted, Schema, Scope } from 'effect'
import { HttpRouter } from 'effect/http'
import { Entity } from 'foldkit-entity'
import { REMOTE_PROTOCOL_VERSION, RemoteUnauthenticated } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { serveFetch } from 'foldkit-remote-server/fetch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  AuthServer,
  type HttpOptions,
  type SessionVerifier,
  type VerifiedSession,
} from '../src/server.js'
import { SUBJECT_HEADER, subjectSaid } from '../src/index.js'

const AuthApi = AuthContract.make('test/Auth', {
  claims: Schema.Struct({ displayName: Schema.String }),
  actions: sessions => ({ signIn: AuthContract.passwordSignIn(sessions) }),
})
const App = Auth.make(AuthApi, {
  sessions: Sessions.stateful({ idleTimeout: '10 minutes', maxAge: '1 hour' }),
  strategies: { password: Password.make() },
  defaultStrategy: 'password',
})
const http = { origin: 'https://app.test' } as const

/** Who a request was answered as: the Source reads its principal back. */
const Whoami = Entity.define('Whoami', Schema.Struct({ id: Schema.String, who: Schema.String }))
const server = RemoteServer.make<Option.Option<{ readonly id: string }>>({
  entities: [
    RemoteServer.entity(Whoami, {
      read: ({ ids, principal }) =>
        Effect.succeed(
          ids.map(id => ({
            id,
            values: {
              who: Option.match(principal, { onNone: () => 'visitor', onSome: user => user.id }),
            },
          })),
        ),
    }),
  ],
})

/** Who may sign in, and the store sessions live in: one, built once, shared below. */
const dependencies = Layer.mergeAll(
  Layer.succeed(App.strategies.password.SessionClaims, {
    resolve: () => Effect.succeed({ displayName: 'Ada' }),
  }),
  Testing.layer(App, {
    subjects: [
      { subjectId: 'ada', email: 'ada@example.invalid', password: Redacted.make('pw pw pw') },
    ],
    requirement: Sessions.AuthenticationRequirement.make({
      alternatives: [
        {
          factors: ['knowledge'],
          minimumCredentials: 1,
          userVerified: false,
          phishingResistant: false,
        },
      ],
      maximumAgeMillis: 60_000,
    }),
  }),
).pipe(Layer.provideMerge(Testing.services({ seed: 'foldkit-auth' })), Layer.orDie)

let services: Context.Context<Layer.Success<typeof dependencies>>
let scope: Scope.Closeable
let routes: {
  readonly handler: (request: Request) => Promise<Response>
  readonly dispose: () => Promise<void>
}

beforeAll(async () => {
  scope = await Effect.runPromise(Scope.make())
  // One store, for the routes that sign in and the server that verifies.
  services = await Effect.runPromise(Layer.buildWithScope(dependencies, scope))
  routes = HttpRouter.toWebHandler(
    Http.layer(App, http).pipe(
      Layer.provide(
        Layer.mergeAll(Layer.succeedContext(services), NodeHttpServer.layerHttpServices),
      ),
      Layer.orDie,
    ),
    { disableLogger: true },
  )
})

afterAll(async () => {
  await routes.dispose()
  await Effect.runPromise(Scope.close(scope, Exit.void))
})

/** Signs ada in through Yielded's own route; the session cookie it set, `name=value`. */
const signIn = async (): Promise<string> => {
  const response = await routes.handler(
    new Request('https://app.test/auth/signIn', {
      method: 'POST',
      headers: {
        origin: 'https://app.test',
        'x-effect-auth-csrf': '1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ payload: { email: 'ada@example.invalid', password: 'pw pw pw' } }),
    }),
  )
  expect(response.status).toBe(200)
  const session = response.headers.getSetCookie().find(cookie => cookie.includes('-session='))
  return session!.split(';')[0]!
}

const served = serveFetch({
  server,
  resolvePrincipal: AuthServer.resolver({
    auth: App,
    http,
    principal: session => Effect.succeed({ id: session.subjectId }),
  }),
  layer: () => App.layer.pipe(Layer.provide(Layer.succeedContext(services)), Layer.orDie),
})

const fromApplication = { origin: 'https://app.test', 'x-effect-auth-csrf': '1' }

const whoami = async (headers: Record<string, string>) => {
  const response = await served(
    new Request('https://app.test/remote', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({
        operation: 'read',
        payload: {
          version: REMOTE_PROTOCOL_VERSION,
          requests: [{ entity: 'Whoami', id: 'me', fields: ['who'] }],
        },
      }),
    }),
    undefined,
  )
  const body = (await response.json()) as {
    readonly result?: {
      readonly entities: ReadonlyArray<{ readonly values: { readonly who: string } }>
    }
    readonly unauthenticated?: { readonly reason?: string }
  }
  return response.status === 200
    ? { status: 200, who: body.result!.entities[0]!.values.who }
    : { status: response.status, reason: body.unauthenticated?.reason }
}

describe('AuthServer.resolver over a real Yielded session', () => {
  it('answers the cookie Yielded set as the subject it names', async () => {
    const cookie = await signIn()
    expect(cookie.startsWith('__Host-effect-auth-session=')).toBe(true)
    expect(await whoami({ ...fromApplication, cookie })).toEqual({ status: 200, who: 'ada' })
  })

  it('answers a request with no cookie as a visitor', async () => {
    expect(await whoami(fromApplication)).toEqual({ status: 200, who: 'visitor' })
  })

  it('answers a request with no cookie and no proof of origin as a visitor', async () => {
    expect(await whoami({})).toEqual({ status: 200, who: 'visitor' })
  })

  it.each([
    ['no Origin it trusts', { origin: 'https://elsewhere.test', 'x-effect-auth-csrf': '1' }],
    ['no Origin', { 'x-effect-auth-csrf': '1' }],
    ['no CSRF header', { origin: 'https://app.test' }],
    ['the wrong CSRF value', { origin: 'https://app.test', 'x-effect-auth-csrf': '0' }],
  ])('refuses a cookie from a request with %s', async (_, headers) => {
    const cookie = await signIn()
    expect(await whoami({ ...headers, cookie })).toEqual({
      status: 401,
      reason: 'The request did not show it came from this application.',
    })
  })

  it('refuses a cookie that no longer verifies', async () => {
    const cookie = `${(await signIn()).split('=')[0]}=not-a-session`
    expect(await whoami({ ...fromApplication, cookie })).toEqual({
      status: 401,
      reason: 'Your session ended.',
    })
  })

  it.each([
    ['a visitor, holding a session', true, subjectSaid(Option.none())],
    ['someone else, holding a session', true, subjectSaid(Option.some('grace'))],
    ['someone, holding none', false, subjectSaid(Option.some('ada'))],
  ])('refuses a client that believes it is %s', async (_, signedIn, believed) => {
    const cookie = signedIn ? { cookie: await signIn() } : {}
    expect(await whoami({ ...fromApplication, ...cookie, [SUBJECT_HEADER]: believed })).toEqual({
      status: 401,
      reason: 'Who is signed in changed.',
    })
  })

  it('answers a client that believes rightly', async () => {
    const cookie = await signIn()
    expect(
      await whoami({
        ...fromApplication,
        cookie,
        [SUBJECT_HEADER]: subjectSaid(Option.some('ada')),
      }),
    ).toEqual({ status: 200, who: 'ada' })
  })

  it('refuses two session cookies', async () => {
    const cookie = await signIn()
    expect(await whoami({ ...fromApplication, cookie: `${cookie}; ${cookie}` })).toEqual({
      status: 401,
      reason: 'Sign in again.',
    })
  })
})

/** A verifier that accepts one credential, `good`, and fails `broken` as `failure`. */
const Verifier = Context.Service<SessionVerifier<VerifiedSession>>('test/Verifier')
const verifier = (failure: Auth.SessionApiError) =>
  Layer.succeed(Verifier, {
    verifySession: credential =>
      Redacted.value(credential) === 'good'
        ? Effect.succeed({ subjectId: 'ada' })
        : Effect.fail(failure),
  })

const resolve = (
  options: HttpOptions,
  cookie: string,
  failure: Auth.SessionApiError,
  headers: Record<string, string> = fromApplication,
) =>
  Effect.runPromiseExit(
    AuthServer.resolver({
      auth: Verifier,
      http: options,
      principal: session => Effect.succeed(session.subjectId),
    })(
      new Request('https://app.test/remote', {
        headers: { ...headers, cookie },
      }),
    ).pipe(Effect.provide(verifier(failure))),
  )

describe('AuthServer.resolver', () => {
  it('treats a session store that fails as a defect, not a visitor', async () => {
    const exit = await resolve(
      http,
      '__Host-effect-auth-session=broken',
      new Sessions.SessionUnavailable(),
    )
    expect(Exit.hasDies(exit)).toBe(true)
  })

  it.each([
    ['a name of its own', { cookie: { name: 'sid' } }, 'sid'],
    ['a prefix of its own', { cookie: { prefix: 'app-' } }, 'app-session'],
    ['a domain', { cookie: { domain: 'app.test' } }, '__Secure-effect-auth-session'],
    ['no secure cookie', { cookie: { secure: false } }, 'effect-auth-session'],
  ] as const)('reads the cookie Yielded names for %s', async (_, cookie, name) => {
    const options = { ...http, ...cookie }
    const exit = await resolve(options, `${name}=good`, new Sessions.SessionInvalid())
    expect(exit).toEqual(Exit.succeed(Option.some('ada')))
  })
  it.each([
    [
      'another origin it trusts',
      { trustedOrigins: ['https://admin.test'] },
      'https://admin.test',
      'x-effect-auth-csrf',
      '1',
    ],
    [
      'a CSRF header of its own',
      { csrf: { header: 'x-app', value: 'yes' } },
      'https://app.test',
      'x-app',
      'yes',
    ],
  ] as const)(
    'reads the cookie from a request with %s',
    async (_, options, origin, header, value) => {
      const exit = await resolve(
        { ...http, ...options },
        '__Host-effect-auth-session=good',
        new Sessions.SessionInvalid(),
        { origin, [header]: value },
      )
      expect(exit).toEqual(Exit.succeed(Option.some('ada')))
    },
  )

  it.each([['null'], ['https://app.test/'], ['app.test']])(
    'throws for %s, which is not an origin',
    origin => {
      expect(() =>
        AuthServer.resolver({
          auth: Verifier,
          http: { origin },
          principal: session => Effect.succeed(session.subjectId),
        }),
      ).toThrow('is not an origin')
    },
  )
})

describe('AuthServer.socket', () => {
  const upgrade = (headers: Record<string, string>) =>
    Effect.runPromiseExit(
      AuthServer.socket({
        auth: Verifier,
        http,
        principal: session => Effect.succeed(session.subjectId),
      })(
        new Request('https://app.test/sync', {
          headers: { upgrade: 'websocket', cookie: '__Host-effect-auth-session=good', ...headers },
        }),
      ).pipe(Effect.provide(verifier(new Sessions.SessionInvalid()))),
    )

  it('reads the cookie of an upgrade from an Origin it trusts, which sends no CSRF header', async () => {
    expect(await upgrade({ origin: 'https://app.test' })).toEqual(Exit.succeed(Option.some('ada')))
  })

  it.each([
    ['an Origin it does not trust', { origin: 'https://elsewhere.test' }],
    ['no Origin', {}],
  ])('refuses the cookie of an upgrade with %s', async (_, headers) => {
    expect(await upgrade(headers)).toEqual(
      Exit.fail(
        new RemoteUnauthenticated({
          message: 'The request did not show it came from this application.',
          reason: 'The request did not show it came from this application.',
        }),
      ),
    )
  })
})

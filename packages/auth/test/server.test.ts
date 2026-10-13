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
import { SUBJECT_CHANGED, SUBJECT_HEADER, believing, subjectSaid } from '../src/index.js'

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

/** ada's session cookie: one sign-in for every case, as Yielded rate-limits them. */
let ada: string
beforeAll(async () => {
  ada = await signIn()
})

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
    const cookie = ada
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
    [
      'Origin: null from another site',
      { origin: 'null', 'sec-fetch-site': 'cross-site', 'x-effect-auth-csrf': '1' },
    ],
    [
      'Origin: null from a sibling site',
      { origin: 'null', 'sec-fetch-site': 'same-site', 'x-effect-auth-csrf': '1' },
    ],
    [
      'no Origin, claiming its own site',
      { 'sec-fetch-site': 'same-origin', 'x-effect-auth-csrf': '1' },
    ],
    ['no CSRF header', { origin: 'https://app.test' }],
    ['the wrong CSRF value', { origin: 'https://app.test', 'x-effect-auth-csrf': '0' }],
  ])('refuses a cookie from a request with %s', async (_, headers) => {
    const cookie = ada
    expect(await whoami({ ...headers, cookie })).toEqual({
      status: 401,
      reason: 'The request did not show it came from this application.',
    })
  })

  it('refuses a cookie that no longer verifies', async () => {
    const cookie = `${ada.split('=')[0]}=not-a-session`
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
    const cookie = signedIn ? { cookie: ada } : {}
    expect(await whoami({ ...fromApplication, ...cookie, [SUBJECT_HEADER]: believed })).toEqual({
      status: 401,
      reason: 'Who is signed in changed.',
    })
  })

  it('reads the cookie of a page that withholds its Origin, by Sec-Fetch-Site', async () => {
    // A page served with Referrer-Policy: no-referrer posts Origin: null to its own site.
    const cookie = ada
    expect(
      await whoami({
        origin: 'null',
        'sec-fetch-site': 'same-origin',
        'x-effect-auth-csrf': '1',
        cookie,
      }),
    ).toEqual({ status: 200, who: 'ada' })
  })

  it('answers a client that believes rightly', async () => {
    const cookie = ada
    expect(
      await whoami({
        ...fromApplication,
        cookie,
        [SUBJECT_HEADER]: subjectSaid(Option.some('ada')),
      }),
    ).toEqual({ status: 200, who: 'ada' })
  })

  it('refuses two session cookies', async () => {
    const cookie = ada
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

describe("AuthServer.resolver for requests: 'browser'", () => {
  const upgrade = (headers: Record<string, string>) =>
    Effect.runPromiseExit(
      AuthServer.resolver({
        requests: 'browser',
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

describe('AuthServer.resolver with a key', () => {
  const believing = (believed: string) =>
    Effect.runPromiseExit(
      AuthServer.resolver({
        auth: Verifier,
        http,
        principal: session => Effect.succeed({ id: session.subjectId }),
        key: user => `user:${user.id}`,
      })(
        new Request('https://app.test/remote', {
          headers: {
            ...fromApplication,
            cookie: '__Host-effect-auth-session=good',
            [SUBJECT_HEADER]: believed,
          },
        }),
      ).pipe(Effect.provide(verifier(new Sessions.SessionInvalid()))),
    )

  it('compares what the client believes with the principal by its key', async () => {
    expect(await believing(subjectSaid(Option.some('user:ada')))).toEqual(
      Exit.succeed(Option.some({ id: 'ada' })),
    )
  })

  it('refuses the session subject where a key names the principal', async () => {
    expect(await believing(subjectSaid(Option.some('ada')))).toEqual(
      Exit.fail(
        new RemoteUnauthenticated({
          message: 'Who is signed in changed.',
          reason: 'Who is signed in changed.',
        }),
      ),
    )
  })
})

describe('AuthServer.answered and believing, end to end', () => {
  const config = {
    auth: App,
    http,
    principal: (session: { readonly subjectId: string }) =>
      Effect.succeed({ id: session.subjectId }),
    key: (user: { readonly id: string }) => user.id,
  }
  const echoing = serveFetch({
    server,
    resolvePrincipal: AuthServer.resolver(config),
    headers: AuthServer.answered(config),
    layer: () => App.layer.pipe(Layer.provide(Layer.succeedContext(services)), Layer.orDie),
  })
  const read = (client: ReturnType<typeof believing>, cookie: Option.Option<string>) =>
    client
      .fetch('https://app.test/remote', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...fromApplication,
          ...Option.match(cookie, { onNone: () => ({}), onSome: cookie => ({ cookie }) }),
        },
        body: JSON.stringify({
          operation: 'read',
          payload: {
            version: REMOTE_PROTOCOL_VERSION,
            requests: [{ entity: 'Whoami', id: 'me', fields: ['who'] }],
          },
        }),
      })
      .then(async response => ({
        status: response.status,
        said: response.headers.get(SUBJECT_HEADER),
        body: (await response.json()) as unknown,
      }))
  const client = () => believing((input, init) => echoing(new Request(input, init), undefined))

  it('says whom it answered, a visitor or a subject by its key', async () => {
    const tab = client()
    expect((await read(tab, Option.none())).said).toBe(subjectSaid(Option.none()))
    const signedIn = client()
    expect((await read(signedIn, Option.some(ada))).said).toBe(subjectSaid(Option.some('ada')))
  })

  it('refuses a client whose cookie changed since it last heard, then answers the next ask', async () => {
    const tab = client()
    expect((await read(tab, Option.none())).status).toBe(200)
    // Another tab signed in: the cookie now names ada, and this one believes a visitor.
    const refused = await read(tab, Option.some(ada))
    expect(refused).toMatchObject({
      status: 401,
      said: null,
      body: { unauthenticated: { reason: SUBJECT_CHANGED } },
    })
    // The refusal forgot the belief: the read Remote.forget asks again is answered.
    expect(await read(tab, Option.some(ada))).toMatchObject({
      status: 200,
      said: subjectSaid(Option.some('ada')),
    })
  })

  it('believes no one after forget, for a change this client made', async () => {
    const tab = client()
    await read(tab, Option.none())
    tab.forget()
    expect((await read(tab, Option.some(ada))).status).toBe(200)
  })
})

describe('believing', () => {
  const answering = (status: number, said?: string) => {
    const sent: Array<string | null> = []
    const tab = believing(async (input, init) => {
      sent.push(new Headers(init?.headers).get(SUBJECT_HEADER))
      return new Response('{}', {
        status,
        headers: said === undefined ? {} : { [SUBJECT_HEADER]: said },
      })
    })
    return { tab, sent }
  }

  it('repeats what the last answer said, and nothing before one has', async () => {
    const { tab, sent } = answering(200, 'subject:ada')
    await tab.fetch('https://app.test/remote')
    await tab.fetch('https://app.test/remote')
    expect(sent).toEqual([null, 'subject:ada'])
  })

  it('keeps its belief through an answer that says nothing', async () => {
    let said: string | undefined = 'subject:ada'
    const sent: Array<string | null> = []
    const tab = believing(async (_, init) => {
      sent.push(new Headers(init?.headers).get(SUBJECT_HEADER))
      const headers: Record<string, string> = said === undefined ? {} : { [SUBJECT_HEADER]: said }
      said = undefined
      return new Response('{}', { headers })
    })
    for (let at = 0; at < 3; at++) await tab.fetch('https://app.test/remote')
    expect(sent).toEqual([null, 'subject:ada', 'subject:ada'])
  })

  it('forgets on any 401, even one that names someone', async () => {
    const { tab, sent } = answering(401, 'subject:ada')
    await tab.fetch('https://app.test/remote')
    await tab.fetch('https://app.test/remote')
    expect(sent).toEqual([null, null])
  })

  it('leaves a header the caller set alone', async () => {
    const { tab, sent } = answering(200, 'subject:ada')
    await tab.fetch('https://app.test/remote')
    await tab.fetch('https://app.test/remote', { headers: { [SUBJECT_HEADER]: 'visitor' } })
    expect(sent).toEqual([null, 'visitor'])
  })

  it("keeps a Request's own headers", async () => {
    const seen: Array<string | null> = []
    const tab = believing(async (input, init) => {
      seen.push(new Headers(init?.headers).get('x-effect-auth-csrf'))
      return new Response('{}', { headers: { [SUBJECT_HEADER]: 'visitor' } })
    })
    await tab.fetch(
      new Request('https://app.test/remote', { headers: { 'x-effect-auth-csrf': '1' } }),
    )
    expect(seen).toEqual(['1'])
  })
})

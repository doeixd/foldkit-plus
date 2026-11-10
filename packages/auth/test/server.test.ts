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
import * as PasswordScrypt from '@yielded/auth/PasswordScrypt'
import * as Testing from '@yielded/auth-persistence/Testing'
import { NodeHttpServer } from '@effect/platform-node'
import {
  Context,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
  Redacted,
  Schema,
  Scope,
} from 'effect'
import { Digest, Kdf, SecureRandom } from 'effect/crypto'
import { HttpRouter } from 'effect/http'
import { Entity } from 'foldkit-entity'
import { REMOTE_PROTOCOL_VERSION, RemoteClient, RemoteUnauthenticated } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { pageReader, serveFetch } from 'foldkit-remote-server/fetch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  AuthServer,
  type AuthHost,
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

/** A Remote read of who is asking, as the page's script sends it. */
const askWho = {
  operation: 'read',
  payload: {
    version: REMOTE_PROTOCOL_VERSION,
    requests: [{ entity: 'Whoami', id: 'me', fields: ['who'] }],
  },
} as const

const accounts = {
  ada: { email: 'ada@example.invalid', password: 'pw pw pw' },
  grace: { email: 'grace@example.invalid', password: 'grace pw pw' },
} as const

const hashing = Password.PasswordHashing.layer(Password.defaultScryptPasswordHashingConfig).pipe(
  Layer.provide(
    Layer.mergeAll(PasswordScrypt.layer, Password.KdfAdmission.layer(), Kdf.layerWebCrypto),
  ),
  Layer.provideMerge(Layer.merge(SecureRandom.layerWebCrypto, Digest.layerWebCrypto)),
)

/** What `App.layer` stands on: who may sign in, and the store sessions live in. */
const dependencies = Layer.mergeAll(
  Layer.succeed(App.strategies.password.SessionClaims, {
    resolve: () => Effect.succeed({ displayName: 'Ada' }),
  }),
  Testing.layer(App, {
    subjects: Object.entries(accounts).map(([subjectId, { email, password }]) => ({
      subjectId,
      email,
      password: Redacted.make(password),
    })),
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
).pipe(Layer.provideMerge(hashing), Layer.orDie)

const http = { origin: 'https://app.test' } as const

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
      body: JSON.stringify({ payload: accounts.ada }),
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
      body: JSON.stringify(askWho),
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
    ['no Origin from another site', { 'sec-fetch-site': 'cross-site', 'x-effect-auth-csrf': '1' }],
    [
      'another origin, claiming its own site',
      {
        origin: 'https://elsewhere.test',
        'sec-fetch-site': 'same-origin',
        'x-effect-auth-csrf': '1',
      },
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

  it.each([
    // A page served with Referrer-Policy: no-referrer posts Origin: null to its own site.
    ['an opaque Origin', { origin: 'null' }],
    // A same-origin GET carries no Origin.
    ['no Origin', {}],
  ])(
    'reads the cookie of a request with %s from its own site, by Sec-Fetch-Site',
    async (_, origin) => {
      const cookie = ada
      expect(
        await whoami({
          ...origin,
          'sec-fetch-site': 'same-origin',
          'x-effect-auth-csrf': '1',
          cookie,
        }),
      ).toEqual({ status: 200, who: 'ada' })
    },
  )

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

describe("AuthServer.resolver for requests: 'navigation'", () => {
  const navigate = (method: string, headers: Record<string, string>) =>
    Effect.runPromiseExit(
      AuthServer.resolver({
        requests: 'navigation',
        auth: Verifier,
        http,
        principal: session => Effect.succeed(session.subjectId),
      })(
        new Request('https://app.test/notes', {
          method,
          headers: { cookie: '__Host-effect-auth-session=good', ...headers },
        }),
      ).pipe(Effect.provide(verifier(new Sessions.SessionInvalid()))),
    )

  it.each([
    ['GET', 'followed from another site', { 'sec-fetch-site': 'cross-site' }],
    ['GET', 'typed into the address bar', { 'sec-fetch-site': 'none' }],
    ['HEAD', 'with no Fetch Metadata', {}],
  ])(
    'reads the cookie of a %s page %s, which sends no Origin or header',
    async (method, _, headers) => {
      expect(await navigate(method, headers)).toEqual(Exit.succeed(Option.some('ada')))
    },
  )

  const refused = Exit.fail(
    new RemoteUnauthenticated({
      message: 'The request did not show it came from this application.',
      reason: 'The request did not show it came from this application.',
    }),
  )

  it('reads the cookie of a page the browser says it navigates to', async () => {
    expect(
      await navigate('GET', { 'sec-fetch-mode': 'navigate', 'sec-fetch-site': 'cross-site' }),
    ).toEqual(Exit.succeed(Option.some('ada')))
  })

  it('refuses the cookie of any other method, from wherever it came', async () => {
    expect(await navigate('POST', fromApplication)).toEqual(refused)
  })

  it.each([
    [
      'a WebSocket upgrade',
      { upgrade: 'websocket', connection: 'Upgrade', origin: 'https://evil.test' },
    ],
    [
      'a WebSocket upgrade the browser marks',
      { upgrade: 'websocket', 'sec-fetch-mode': 'websocket' },
    ],
    ['a script’s fetch', { 'sec-fetch-mode': 'cors', 'sec-fetch-site': 'cross-site' }],
  ])('refuses the cookie of %s, which is no navigation', async (_, headers) => {
    expect(await navigate('GET', headers)).toEqual(refused)
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
        body: JSON.stringify(askWho),
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

  it('names a principal whose key no header could carry as it is', async () => {
    const named = serveFetch({
      server,
      resolvePrincipal: AuthServer.resolver({ ...config, key: () => 'Ada Lovelace, 日本' }),
      headers: AuthServer.answered({ key: () => 'Ada Lovelace, 日本' }),
      layer: () => App.layer.pipe(Layer.provide(Layer.succeedContext(services)), Layer.orDie),
    })
    const tab = believing((input, init) => named(new Request(input, init), undefined))
    expect(await read(tab, Option.some(ada))).toMatchObject({
      status: 200,
      said: 'subject:Ada%20Lovelace%2C%20%E6%97%A5%E6%9C%AC',
    })
    // And the next read, repeating it, is answered: the check reads it the same way.
    expect((await read(tab, Option.some(ada))).status).toBe(200)
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

  it('believes no answer to a request sent before a forget or a 401', async () => {
    const sent: Array<string | null> = []
    const answers: Array<(response: Response) => void> = []
    const tab = believing(
      (_, init) =>
        new Promise(resolve => {
          sent.push(new Headers(init?.headers).get(SUBJECT_HEADER))
          answers.push(resolve)
        }),
    )
    const said = (who: string, status = 200) =>
      new Response('{}', { status, headers: { [SUBJECT_HEADER]: who } })
    // A visitor's read is in flight when this tab signs in and forgets.
    const stale = tab.fetch('https://app.test/remote')
    tab.forget()
    const fresh = tab.fetch('https://app.test/remote')
    answers[1]!(said('subject:ada'))
    await fresh
    answers[0]!(said('visitor'))
    await stale
    // So too after a 401: an answer to what was sent before it is stale.
    const before = tab.fetch('https://app.test/remote')
    const refused = tab.fetch('https://app.test/remote')
    answers[3]!(said('subject:grace', 401))
    await refused
    answers[2]!(said('subject:ada'))
    await before
    void tab.fetch('https://app.test/remote')
    expect(sent).toEqual([null, null, 'subject:ada', 'subject:ada', null])
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

/**
 * `AuthServer.host`: one Yielded application's routes and the two resolvers
 * that read its cookie. A reader signs in through the routes; `/remote`
 * (`serveFetch` with `scripted`) reads the cookie only from the page's own
 * script, and a page render (`pageReader` with `navigation`) reads it from a
 * navigation, from anywhere, and never writes. Both ask who the session is
 * on every request. Requests are built here, never sent: Node's `fetch`,
 * which overwrites `Sec-Fetch-Mode`, is not involved.
 */
describe('AuthServer.host', () => {
  const origin = 'https://app.test'
  // A cookie of its own name: the routes must set the one the resolvers read.
  const http = { origin, cookie: { prefix: '__Host-notes-' } } as const
  const fromThePage = { origin, 'x-effect-auth-csrf': '1' }

  type Reader = { readonly id: string }

  /** Whose sessions the principal was asked for, in order. */
  const asked: Array<string> = []

  const runtime = ManagedRuntime.make(App.layer.pipe(Layer.provideMerge(dependencies)))
  let host: AuthHost<Reader, never>
  let remote: (request: Request, env: unknown) => Promise<Response>
  let read: ReturnType<typeof pageReader<Option.Option<Reader>, never, unknown>>

  beforeAll(async () => {
    host = AuthServer.host({
      auth: App,
      http,
      services: await runtime.context(),
      principal: session =>
        Effect.sync((): Reader => {
          asked.push(session.subjectId)
          return { id: session.subjectId }
        }),
      // Not the subject id, so a check by the subject id instead would refuse.
      key: user => `reader:${user.id}`,
    })
    remote = serveFetch({ server, layer: () => Layer.empty, ...host.scripted })
    read = pageReader({ server, layer: () => Layer.empty, ...host.navigation })
  })

  afterAll(async () => {
    await host.dispose()
    await runtime.dispose()
  })

  const authPost = (path: string, cookie?: string, body: unknown = {}) =>
    host.routes(
      new Request(`${origin}/auth/${path}`, {
        method: 'POST',
        headers: {
          ...fromThePage,
          'content-type': 'application/json',
          ...(cookie === undefined ? {} : { cookie }),
        },
        body: JSON.stringify(body),
      }),
    )

  /**
   * Signs in through the host's routes; the session cookie they set, `name=value`,
   * whatever its name, which a test of its own checks.
   */
  const signIn = async (who: keyof typeof accounts): Promise<string> => {
    const response = await authPost('signIn', undefined, { payload: accounts[who] })
    expect(response.status).toBe(200)
    const cookie = response.headers.getSetCookie().find(each => each.includes('-session='))
    if (cookie === undefined) throw new Error(`${who} signed in with no session cookie`)
    return cookie.split(';')[0]!
  }

  let ada: string
  let grace: string
  beforeAll(async () => {
    ada = await signIn('ada')
    grace = await signIn('grace')
  })

  /** `/remote` asked who is asking, as `headers` say. */
  const whoami = async (headers: Record<string, string>) => {
    const response = await remote(
      new Request(`${origin}/remote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(askWho),
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
      ? {
          status: 200,
          who: body.result!.entities[0]!.values.who,
          said: response.headers.get(SUBJECT_HEADER),
        }
      : { status: response.status, reason: body.unauthenticated?.reason }
  }

  /** A page render's read of who is asking, through the reader of a request with `headers`. */
  const pageWho = (headers: Record<string, string>, method = 'GET') =>
    Effect.runPromise(
      Effect.flatMap(RemoteClient, client => client.read(askWho.payload)).pipe(
        Effect.map(answer => ({ who: answer.entities[0]?.values['who'] })),
        Effect.provide(read(new Request(`${origin}/notes`, { method, headers }), undefined)),
        Effect.catchTag('Unauthenticated', refusal => Effect.succeed({ refused: refusal.reason })),
      ),
    )

  /** What a browser sends navigating to a page from a link on another site: no Origin, no header of a script's. */
  const navigation = { 'sec-fetch-mode': 'navigate', 'sec-fetch-site': 'cross-site' }

  const notFromHere = 'The request did not show it came from this application.'

  describe('/remote, with scripted', () => {
    it('signs in through its routes with the cookie its `http` names', () => {
      expect(ada.startsWith('__Host-notes-session=')).toBe(true)
    })

    it('reads the cookie its routes set as each reader, asking per request', async () => {
      asked.length = 0
      expect(await whoami({ ...fromThePage, cookie: ada })).toMatchObject({
        status: 200,
        who: 'ada',
      })
      expect(await whoami({ ...fromThePage, cookie: grace })).toMatchObject({
        status: 200,
        who: 'grace',
      })
      expect(await whoami({ ...fromThePage, cookie: ada })).toMatchObject({
        status: 200,
        who: 'ada',
      })
      expect(asked).toEqual(['ada', 'grace', 'ada'])
    })

    it('says whom it answered, and compares what the client believes, by the key', async () => {
      const said = subjectSaid(Option.some('reader:ada'))
      expect(await whoami({ ...fromThePage, cookie: ada })).toMatchObject({ said })
      expect(await whoami({ ...fromThePage, cookie: ada, [SUBJECT_HEADER]: said })).toMatchObject({
        who: 'ada',
      })
    })

    it.each([
      ['no CSRF header', { origin }],
      ['an Origin it does not trust', { ...fromThePage, origin: 'https://elsewhere.test' }],
      ['no Origin, from another site', { ...navigation, 'x-effect-auth-csrf': '1' }],
    ])('refuses the cookie of a request with %s', async (_, headers) => {
      expect(await whoami({ ...headers, cookie: ada })).toEqual({
        status: 401,
        reason: notFromHere,
      })
    })
  })

  describe('a page render, with navigation', () => {
    it('reads the cookie of a navigation from another site as the reader', async () => {
      expect(await pageWho({ ...navigation, cookie: ada })).toEqual({ who: 'ada' })
      expect(await pageWho({ ...navigation, cookie: grace })).toEqual({ who: 'grace' })
    })

    it.each([
      ['a POST, even from the page itself', 'POST', fromThePage],
      ['a script’s fetch', 'GET', { ...fromThePage, 'sec-fetch-mode': 'cors' }],
      ['a WebSocket upgrade', 'GET', { origin, upgrade: 'websocket' }],
    ])('refuses the cookie of %s', async (_, method, headers) => {
      expect(await pageWho({ ...headers, cookie: ada }, method)).toEqual({ refused: notFromHere })
    })

    it('writes nothing, as the reader it names', async () => {
      const write = Effect.flatMap(RemoteClient, client =>
        client.mutate({ requestId: 'page:1', mutation: 'Anything', input: {} }),
      )
      const refused = await Effect.runPromise(
        Effect.flip(
          write.pipe(
            Effect.provide(
              read(
                new Request(`${origin}/notes`, { headers: { ...navigation, cookie: ada } }),
                undefined,
              ),
            ),
          ),
        ),
      )
      expect(refused).toMatchObject({
        _tag: 'RemoteMutationError',
        message: 'A page render reads; it does not write',
      })
    })
  })

  describe('both', () => {
    it('refuses a session its routes signed out, on /remote and on a page', async () => {
      const leaving = await signIn('grace')
      expect(await whoami({ ...fromThePage, cookie: leaving })).toMatchObject({ who: 'grace' })
      expect((await authPost('signOut', leaving)).status).toBe(200)
      expect(await whoami({ ...fromThePage, cookie: leaving })).toEqual({
        status: 401,
        reason: 'Your session ended.',
      })
      expect(await pageWho({ ...navigation, cookie: leaving })).toEqual({
        refused: 'Your session ended.',
      })
    })

    it('throws for OAuth options, whose callbacks it does not mount', async () => {
      const services = await runtime.context()
      const oauth = { ...http, oauth: { providers: {} } }
      expect(() =>
        AuthServer.host({
          auth: App,
          http: oauth,
          services,
          principal: () => Effect.succeed('ada'),
        }),
      ).toThrow('mounts no OAuth callbacks')
    })
  })
})

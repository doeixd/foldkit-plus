/**
 * The server: Yielded Auth signs people in and keeps their sessions;
 * `AuthServer.resolver` turns the session cookie of each Remote request into
 * the guard set's principal; the guards decide which notes that principal
 * reads. Nothing here is a Fetch or Node server; `http.ts` is.
 */
import { NodeHttpServer } from '@effect/platform-node'
import { Auth, Http, Password, Sessions } from '@yielded/auth'
import * as Testing from '@yielded/auth-persistence/Testing'
import { Effect, Exit, Layer, ManagedRuntime, Option, Redacted, Scope } from 'effect'
import { HttpRouter } from 'effect/http'
import { AuthServer } from 'foldkit-auth/server'
import { GuardServer } from 'foldkit-guard/server'
import { Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { pageReader, serveFetch } from 'foldkit-remote-server/fetch'
import { ActorId, Journal, OpId } from 'foldkit-durable'
import type { Operation, Sync } from 'foldkit-sync'
import { documentHost } from 'foldkit-sync/journal'
import {
  AuthApi,
  type BoardMessage,
  Domain,
  G,
  Me,
  Note,
  Notes,
  PinBoard,
  type User,
} from './domain.js'

/** Who may sign in: the account Yielded checks, and the principal the guards read. */
export const accounts = [
  {
    subjectId: 'ada',
    email: 'ada@example.invalid',
    password: 'ada password',
    user: { id: 'ada', role: 'admin' },
  },
  {
    subjectId: 'grace',
    email: 'grace@example.invalid',
    password: 'grace password',
    user: { id: 'grace', role: 'member' },
  },
] as const satisfies ReadonlyArray<{
  readonly subjectId: string
  readonly email: string
  readonly password: string
  readonly user: User
}>

export const notes = [
  { id: 'n1', authorId: 'ada', title: 'Notes on the Analytical Engine' },
  { id: 'n2', authorId: 'grace', title: 'A compiler for A-0' },
  { id: 'n3', authorId: 'ada', title: 'Bernoulli numbers, step by step' },
  { id: 'n4', authorId: 'grace', title: 'A nanosecond, cut to length' },
]

export const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
})

/**
 * The notes held in memory, each read through its Read rule, and `Me`
 * beside them: no stored row, so this backend's domain leaves it out, and
 * `GuardServer.me` answers it from the principal. No `principal` either:
 * `serveFetch` answers through `server`, as whoever each request resolves to.
 */
export const { server } = RemoteServer.memory({
  domain: Remote.define({ entities: [Note], queries: [Notes] }),
  rows: { Note: notes },
  entities: [GuardServer.me(Me, Policy)],
  ...GuardServer.memory(Policy, [Note]),
})

// A Source that skipped a Read rule would serve every note; refuse to start instead.
GuardServer.validate(Policy, { entities: [Note, Me], domain: Domain, server })

const App = Auth.make(AuthApi, {
  sessions: Sessions.stateful({ idleTimeout: '1 hour', maxAge: '1 day' }),
  strategies: { password: Password.make() },
  defaultStrategy: 'password',
})

/**
 * Yielded's in-memory store, seeded with the two accounts. `Testing` is
 * Yielded's test support: it keeps sessions in this process and loses them
 * on restart. A deployment uses `@yielded/auth-persistence`'s SQL store.
 */
const store = Layer.mergeAll(
  Layer.succeed(App.strategies.password.SessionClaims, { resolve: () => Effect.succeed({}) }),
  Testing.layer(App, {
    subjects: accounts.map(({ subjectId, email, password }) => ({
      subjectId,
      email,
      password: Redacted.make(password),
    })),
    // What a sign-in must show: one password, given within the minute.
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
).pipe(Layer.provideMerge(Testing.services()), Layer.orDie)

/** The principal of a verified session: looked up per request, never taken from its claims. */
const principalOf = (session: { readonly subjectId: string }) =>
  Option.match(
    Option.fromUndefinedOr(accounts.find(account => account.subjectId === session.subjectId)),
    {
      onNone: () => Effect.fail(RemoteServer.unauthenticated('No such account.')),
      onSome: account => Effect.succeed<User>(account.user),
    },
  )

/** What the board's journal keeps: the shared slice of its Model. */
type BoardShared = typeof PinBoard extends Sync<BoardMessage, infer Shared> ? Shared : never

/** How often a board socket asks again who it serves. */
export const SYNC_REVALIDATE = '1 second'

/**
 * Both servers over one store: Yielded's routes (`/auth/…`), which set and
 * clear the cookie, and Remote's endpoint (`/remote`), which reads it, with
 * `read`, the reader a page's own reads go through in this process.
 * `origin` is the page's: Yielded trusts a sign-in from it alone, and the
 * resolver reads a cookie only from a request that shows it came from there.
 */
export const openServer = async (origin: string) => {
  // Yielded's default cookie, `__Host-` and Secure, even over plain http:
  // Chromium counts 127.0.0.1 as secure and keeps it (the e2e test signs in so).
  const http = { origin } as const
  // Yielded's `Auth` built once, over the store: Remote's requests share it.
  const runtime = ManagedRuntime.make(App.layer.pipe(Layer.provideMerge(store), Layer.orDie))
  const services = await runtime.context()
  const shared = Layer.succeedContext(services)
  const routes = HttpRouter.toWebHandler(
    Http.layer(App, http).pipe(
      Layer.provide(Layer.mergeAll(shared, NodeHttpServer.layerHttpServices)),
      Layer.orDie,
    ),
    { disableLogger: true },
  )
  // `key` names the principal as `Me` does, for the answer's header and the check of it.
  const resolving = { auth: App, http, principal: principalOf, key: Policy.key }
  const remoteConfig = {
    server,
    resolvePrincipal: AuthServer.resolver(resolving),
    headers: AuthServer.answered(resolving),
    layer: () => shared,
  }
  const remote = serveFetch(remoteConfig)
  // A page's own reads, in this process. A page request is a navigation,
  // which carries no CSRF header; the reader it resolves cannot write.
  const read = pageReader({
    ...remoteConfig,
    resolvePrincipal: AuthServer.resolver({ ...resolving, requests: 'navigation' }),
  })
  // The board's journal: in memory, as the sessions are, and gone on restart.
  const scope = Effect.runSync(Scope.make())
  const journal = Effect.runSync(
    Journal.make<Operation, BoardShared, Option.Option<User>>({
      ...PinBoard.journalContract(),
      file: ':memory:',
      opId: operation => OpId.make(operation.opId),
      actorId: principal =>
        ActorId.make(Option.match(principal, { onNone: () => 'visitor', onSome: user => user.id })),
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
  // A browser's WebSocket sends no header of the page's: its Origin alone
  // vouches for the cookie (`requests: 'browser'`).
  const sync = documentHost({
    sync: PinBoard,
    journal: async () => journal,
    resolvePrincipal: AuthServer.resolver({ ...resolving, requests: 'browser' }),
    layer: () => shared,
    // A sign-out in any tab ends the session the socket opened with: it closes
    // within this. No `key`: the cookie a socket opened with names one user for good.
    revalidate: { every: SYNC_REVALIDATE },
    // The board is the signed-in readers': a visitor's socket reads and writes nothing.
    opens: principal => Effect.succeed(Option.isSome(principal)),
  })
  return {
    auth: routes.handler,
    remote,
    read,
    sync,
    close: async () => {
      await routes.dispose()
      await runtime.dispose()
      Effect.runSync(Scope.close(scope, Exit.void))
    },
  }
}

/**
 * `foldkit-auth/server`: a Yielded Auth session as the principal a Foldkit
 * Plus host answers as. A request's session cookie is verified with the
 * application's own `Auth` service; what the session is in the application's
 * terms (the guard set's principal, say) is the application's `principal`.
 */
import type { Auth, Http } from '@yielded/auth'
import { Effect, Option, Redacted, type Context } from 'effect'
import { RemoteUnauthenticated } from 'foldkit-remote'
import { SUBJECT_HEADER, subjectSaid } from './index.js'

/** The part of a session this package reads; the application's `principal` reads the rest. */
export interface VerifiedSession {
  readonly subjectId: string
}

/**
 * The `Auth` service of `Auth.make(…)`, as far as this package uses it:
 * verifying a credential outside Yielded's own HTTP middleware.
 */
export type SessionVerifier<S extends VerifiedSession> = {
  readonly verifySession: (
    credential: Redacted.Redacted<string>,
  ) => Effect.Effect<S, Auth.SessionApiError>
}

/** The `Http.make` options this package reads: the same object, so the two agree. */
export type HttpOptions = Pick<
  Http.AuthHttpOptions,
  'origin' | 'trustedOrigins' | 'cookie' | 'csrf'
>

/** The session cookie's name, as Yielded's `Http.make` names it from the same options. */
const sessionCookieName = (http: HttpOptions): string => {
  if (http.cookie?.name !== undefined) return http.cookie.name
  const secure = http.cookie?.secure ?? true
  const required = http.cookie?.domain === undefined ? '__Host-' : '__Secure-'
  return `${http.cookie?.prefix ?? (secure ? `${required}effect-auth-` : 'effect-auth-')}session`
}

/** Every value the `cookie` header gives `name`: more than one is a request to refuse. */
const cookieValues = (header: string | null, name: string): ReadonlyArray<string> =>
  (header ?? '').split(';').flatMap(pair => {
    const at = pair.indexOf('=')
    return at > 0 && pair.slice(0, at).trim() === name ? [pair.slice(at + 1).trim()] : []
  })

const refuse = (reason: string) => new RemoteUnauthenticated({ message: reason, reason })

export const AuthServer = {
  /**
   * Who a request is, from its Yielded session cookie, for `serveFetch`'s
   * `resolvePrincipal` and any host that answers a `Request`. No cookie is a
   * visitor (`Option.none()`). A cookie is only read from a request that
   * shows it came from the application, as Yielded's own mutations must
   * (an `Origin` it trusts and its CSRF header): any other is answered as a
   * visitor, so a page elsewhere borrows no one's session. A cookie that no
   * longer verifies is refused, as is a request whose `x-foldkit-subject`
   * names someone the server would not answer as. A session store that
   * fails is a defect, never a visitor.
   *
   * ```ts
   * serveFetch({
   *   server,
   *   resolvePrincipal: AuthServer.resolver({
   *     auth: AppAuth,
   *     http, // the options given Http.make(AppAuth, http)
   *     principal: session => Users.find(session.subjectId),
   *   }),
   *   layer: env => AuthLive(env),
   * })
   * ```
   */
  resolver:
    <I, S extends VerifiedSession, User, R = never>(config: {
      readonly auth: Context.Key<I, SessionVerifier<S>>
      readonly http: HttpOptions
      /** The application's principal for a verified session; it may refuse it. */
      readonly principal: (session: S) => Effect.Effect<User, RemoteUnauthenticated, R>
    }) =>
    (request: Request): Effect.Effect<Option.Option<User>, RemoteUnauthenticated, I | R> => {
      const name = sessionCookieName(config.http)
      const trusted = new Set([config.http.origin, ...(config.http.trustedOrigins ?? [])])
      const csrf = config.http.csrf ?? { header: 'x-effect-auth-csrf', value: '1' }
      return Effect.gen(function* () {
        const credentials = cookieValues(request.headers.get('cookie'), name)
        if (credentials.length > 1) return yield* refuse('Sign in again.')
        const fromApplication =
          trusted.has(request.headers.get('origin') ?? '') &&
          request.headers.get(csrf.header) === csrf.value
        const credential = fromApplication ? credentials[0] : undefined
        const auth = yield* config.auth
        const session =
          credential === undefined
            ? Option.none<S>()
            : Option.some(
                yield* auth.verifySession(Redacted.make(credential)).pipe(
                  Effect.catchTag('SessionInvalid', () => refuse('Your session ended.')),
                  // Anything else is the session store failing, not the caller.
                  Effect.catchIf(
                    (error): error is Exclude<typeof error, RemoteUnauthenticated> =>
                      !(error instanceof RemoteUnauthenticated),
                    Effect.die,
                  ),
                ),
              )
        const believed = request.headers.get(SUBJECT_HEADER)
        if (
          believed !== null &&
          believed !== subjectSaid(Option.map(session, ({ subjectId }) => subjectId))
        ) {
          return yield* refuse(
            credentials.length > 0 && !fromApplication
              ? 'The request did not show it came from this application.'
              : 'Who is signed in changed.',
          )
        }
        return yield* Option.match(session, {
          onNone: () => Effect.succeed(Option.none<User>()),
          onSome: verified => Effect.map(config.principal(verified), Option.some),
        })
      })
    },
}

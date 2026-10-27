/**
 * `foldkit-auth/server`: a Yielded Auth session as the principal a Foldkit
 * Plus host answers as. A request's session cookie is verified with the
 * application's own `Auth` service; what the session is in the application's
 * terms (the guard set's principal, say) is the application's `principal`.
 */
import type { Auth, Http } from '@yielded/auth'
import { Effect, Option, Redacted, type Context } from 'effect'
import { RemoteUnauthenticated } from 'foldkit-remote'
import { SUBJECT_CHANGED, SUBJECT_HEADER, subjectSaid } from './index.js'

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

/**
 * Whether `request` came from one of `trusted`, by what the browser sends and
 * no page can set: its `Origin`, or, where it sends none (a same-origin `GET`)
 * or an opaque one (`Origin: null`, from a page served with `Referrer-Policy:
 * no-referrer`), its Fetch Metadata `Sec-Fetch-Site`. Origins, not sites, so a
 * sibling subdomain is not trusted for sharing the site. A request with
 * neither header is refused. `foldkit-ssr` checks a posted form the same way.
 */
const cameFrom = (request: Request, trusted: ReadonlySet<string>): boolean => {
  const origin = request.headers.get('origin')
  return origin === null || origin === 'null'
    ? request.headers.get('sec-fetch-site') === 'same-origin'
    : trusted.has(origin)
}

const refuse = (reason: string) => new RemoteUnauthenticated({ message: reason, reason })

/** Refuses a request whose `x-foldkit-subject` names someone other than `subject`. */
const checkBelieved = (request: Request, subject: Option.Option<string>) => {
  const believed = request.headers.get(SUBJECT_HEADER)
  return believed === null || believed === subjectSaid(subject)
    ? Effect.void
    : refuse(SUBJECT_CHANGED)
}

const asVisitor = (request: Request) =>
  Effect.as(checkBelieved(request, Option.none()), Option.none())

/** What `AuthServer.resolver` takes. */
export interface ResolverConfig<I, S extends VerifiedSession, User, R> {
  /** The `Auth.make(…)` service, which the host's `layer` provides. */
  readonly auth: Context.Key<I, SessionVerifier<S>>
  /** The options given `Http.make`: the cookie's name, trusted origins and CSRF header. */
  readonly http: HttpOptions
  /** The application's principal for a verified session; it may refuse it. */
  readonly principal: (session: S) => Effect.Effect<User, RemoteUnauthenticated, R>
  /**
   * Who makes the requests this resolves. `'scripted'` (the default): the
   * page's own `fetch`, which sends Yielded's CSRF header beside a trusted
   * `Origin`. `'browser'`: what a browser sends on the page's behalf, a
   * WebSocket upgrade or a posted form, which carries no header of the
   * page's; its `Origin`, which every browser sends on one, vouches alone.
   * `'navigation'`: a page the browser navigates to, for a render's reader
   * that cannot write (`pageReader`): the cookie of a `GET` or `HEAD` is used
   * with no `Origin` or header asked, as any server-rendered page reads its
   * reader's session, since a link from anywhere opens one; on any other
   * method it is refused.
   */
  readonly requests?: 'scripted' | 'browser' | 'navigation' | undefined
  /**
   * Who the principal is, for the `x-foldkit-subject` check: the client
   * says who it believes it is by this, as `foldkit-guard`'s `Me` shows it
   * (`key: Policy.key`). Without it, the session's `subjectId`.
   */
  readonly key?: ((user: User) => string) | undefined
}

/** Who a request is: a visitor, someone, or refused. */
export type Resolver<User, R> = (
  request: Request,
) => Effect.Effect<Option.Option<User>, RemoteUnauthenticated, R>

const resolver = <I, S extends VerifiedSession, User, R = never>(
  config: ResolverConfig<I, S, User, R>,
): Resolver<User, I | R> => {
  const name = sessionCookieName(config.http)
  const trusted = new Set([config.http.origin, ...(config.http.trustedOrigins ?? [])])
  for (const origin of trusted) {
    // What Http.make refuses too: an Origin header is exactly `URL.origin`, so
    // anything else (`null`, a trailing slash) trusts what no browser sends,
    // or what a sandboxed page does.
    if (!URL.canParse(origin) || new URL(origin).origin !== origin)
      throw new Error(`AuthServer.resolver: ${JSON.stringify(origin)} is not an origin`)
  }
  const csrf = config.http.csrf ?? { header: 'x-effect-auth-csrf', value: '1' }
  const vouched = (request: Request): boolean =>
    config.requests === 'navigation'
      ? request.method === 'GET' || request.method === 'HEAD'
      : cameFrom(request, trusted) &&
        (config.requests === 'browser' || request.headers.get(csrf.header) === csrf.value)
  return request =>
    Effect.gen(function* () {
      const credentials = cookieValues(request.headers.get('cookie'), name)
      if (credentials.length === 0) return yield* asVisitor(request)
      // A cookie rides along with any request to the site; only one that
      // shows it came from the application may use it, as Yielded's own
      // mutations must. Refused rather than answered as a visitor, so a
      // client that forgot the header learns it at once.
      if (!vouched(request))
        return yield* refuse('The request did not show it came from this application.')
      if (credentials.length > 1) return yield* refuse('Sign in again.')
      const auth = yield* config.auth
      const session = yield* auth.verifySession(Redacted.make(credentials[0]!)).pipe(
        Effect.catchTag('SessionInvalid', () => refuse('Your session ended.')),
        // Anything else is the session store failing, not the caller.
        Effect.catchIf(
          (error): error is Exclude<typeof error, RemoteUnauthenticated> =>
            !(error instanceof RemoteUnauthenticated),
          Effect.die,
        ),
      )
      const { key } = config
      if (key === undefined) {
        yield* checkBelieved(request, Option.some(session.subjectId))
        return Option.some(yield* config.principal(session))
      }
      const user = yield* config.principal(session)
      yield* checkBelieved(request, Option.some(key(user)))
      return Option.some(user)
    })
}

export const AuthServer = {
  /**
   * Who a request is, from its Yielded session cookie, for a host's
   * `resolvePrincipal`. No cookie is a visitor (`Option.none()`). A cookie is
   * used only from a request that shows it came from the application, as
   * Yielded's own mutations must: an `Origin` it trusts and, for `requests:
   * 'scripted'`, its CSRF header. From any other it is refused, as is a
   * cookie that no longer verifies, two of them, or an `x-foldkit-subject`
   * naming someone else. A session store that fails is a defect, never a
   * visitor. Throws when `http` names an origin that is not one.
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
  resolver,
  /**
   * The header saying whom an answer was for, for `serveFetch`'s `headers`:
   * what `believing`'s `fetch` repeats on the client's next request, so the
   * resolver refuses it once the cookie means someone else. Takes the
   * resolver's own config, whose `key` it requires, so the two name the
   * principal alike.
   *
   * ```ts
   * const auth = { auth: AppAuth, http, principal, key: Policy.key }
   * serveFetch({
   *   server,
   *   resolvePrincipal: AuthServer.resolver(auth),
   *   headers: AuthServer.answered(auth),
   *   layer: env => AuthLive(env),
   * })
   * ```
   */
  answered:
    <User>(config: { readonly key: (user: User) => string }) =>
    (principal: Option.Option<User>): Readonly<Record<string, string>> => ({
      [SUBJECT_HEADER]: subjectSaid(Option.map(principal, config.key)),
    }),
}

/**
 * `foldkit-guard/media`: `foldkit-media`'s `UploadPolicy` decided by a guard
 * set. Who is asking comes from the application's resolver, the one its
 * Remote server is given (`AuthServer.resolver` from `foldkit-auth/server` has
 * the shape), read from the request's headers alone, so the upload route
 * still reads no byte before the policy has answered. Each route is decided by
 * principal guards, since no row exists yet; a route not named is refused.
 */
import { Effect, Layer, Option } from 'effect'
import { HttpServerRequest } from 'effect/http'
import {
  UploadForbidden,
  UploadPolicy,
  UploadUnauthenticated,
  type UploadRoute,
} from 'foldkit-media/server'
import type { Policy, PrincipalGuard } from './index.js'

export interface UploadPolicyConfig<User, E, R> {
  /**
   * Who is asking, from a request holding the upload's URL, method and
   * headers, and no body. A failure means it could not tell (an untrusted
   * origin, a session that ended), answered `401`; none is a visitor.
   */
  readonly resolve: (request: Request) => Effect.Effect<Option.Option<User>, E, R>
  /** Who may upload: any one of these principal guards. Omitted, nobody. */
  readonly Upload?: ReadonlyArray<PrincipalGuard<User>>
  /** Who may have an image named by URL described. Omitted, nobody. */
  readonly DescribeUrl?: ReadonlyArray<PrincipalGuard<User>>
}

// The URL a request arrived at. On the web its `originalUrl` is whole; on a Node server it is a
// path, and `toURL` rebuilds it from the `Host` header (else `http://localhost`).
const urlOf = (request: HttpServerRequest.HttpServerRequest): Option.Option<URL> =>
  URL.canParse(request.originalUrl)
    ? Option.some(new URL(request.originalUrl))
    : HttpServerRequest.toURL(request)

// The URL, method and headers the resolver reads, and never the body: in a Worker,
// `HttpServerRequest.toWeb` would hand back the request itself, stream and all.
const headersOnly = (request: HttpServerRequest.HttpServerRequest): Option.Option<Request> =>
  Option.map(
    urlOf(request),
    url => new Request(url, { method: request.method, headers: request.headers }),
  )

/**
 * An `UploadPolicy` deciding each route by `policy`'s principal guards for who
 * `resolve` says is asking. A route admits when any one of its guards allows;
 * a refusal's reason stays on the server, as every media refusal says only
 * its kind. `policy` must need no service of its own: give it what its bodies
 * need with `Policy.provide`, as the other seams take it.
 */
const uploadPolicy = <User, E, R>(
  policy: Policy<User>,
  config: UploadPolicyConfig<User, E, R>,
): Layer.Layer<UploadPolicy, never, R> =>
  Layer.effect(
    UploadPolicy,
    Effect.map(Effect.context<R>(), context => ({
      admit: (request: HttpServerRequest.HttpServerRequest, route: UploadRoute) =>
        Effect.gen(function* () {
          const asked = yield* Option.match(headersOnly(request), {
            onNone: () => Effect.fail(new UploadUnauthenticated({})),
            onSome: Effect.succeed,
          })
          const principal = yield* config
            .resolve(asked)
            .pipe(Effect.mapError(() => new UploadUnauthenticated({})))
          for (const guard of config[route] ?? []) {
            if ((yield* policy.decide(guard, { principal, interaction: route })) === true) return
          }
          return yield* new UploadForbidden({})
        }).pipe(Effect.provideContext(context)),
    })),
  )

export const GuardMedia = { uploadPolicy } as const

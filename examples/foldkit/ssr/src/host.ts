/**
 * The production host, as upstream's `scripts/serve.ts` builds it: an Effect
 * HTTP server on Node that resolves the request target against the origin,
 * answers a file when one exists, and renders every other request through the
 * server entry. Development is plain `vite`, which renders through the same
 * entry; here they are `vite build`'s `dist/`.
 */
import { NodeHttpServer } from '@effect/platform-node'
import { Context, Effect, Exit, FileSystem, Layer, Match, Option, Path, Scope } from 'effect'
import type { PlatformError } from 'effect/PlatformError'
import {
  HttpPlatform,
  HttpServer,
  HttpServerError,
  HttpServerRequest,
  HttpServerResponse,
  HttpStaticServer,
} from 'effect/http'
import {
  HOST_METHOD_ANSWERS,
  handleRequest,
  isHostSettledMethod,
  resolveRequestUrl,
  resolvesToIndexHtml,
} from 'foldkit/experimental/server'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'

import { makeRenderPage } from './renderPage.js'

type PageHandler = (request: Request) => Promise<Response>

type Files = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  HttpServerError.HttpServerError,
  HttpServerRequest.HttpServerRequest
>

/** Where the host finds the page's scripts and styles, and its template. */
export interface Assets {
  /** Answers with a file, or fails with `RouteNotFound` for the page to answer. */
  readonly files: Files
  /** The page handler for a request to `url`. */
  readonly pages: (url: string) => Promise<PageHandler>
}

/** How the host acquires its assets, with the services the Node server provides. */
export type AssetsOf = Effect.Effect<
  Assets,
  PlatformError,
  Scope.Scope | FileSystem.FileSystem | Path.Path | HttpPlatform.HttpPlatform
>

/** What `vite build` wrote to `dist`: its files, and its `index.html` as the template. */
export const production = (dist: string): AssetsOf => {
  // The deployment the pages belong to: the same `FOLDKIT_BUILD_ID` value
  // `vite build` compiled into the client bundle, or every page is refused.
  const buildId = process.env.FOLDKIT_BUILD_ID
  if (buildId === undefined || buildId === '') {
    throw new Error(
      'set FOLDKIT_BUILD_ID to the deployment this server answers for, the same value `vite build` saw',
    )
  }
  const renderPage = makeRenderPage(buildId)
  return Effect.gen(function* () {
    const template = yield* Effect.promise(() => readFile(join(dist, 'index.html'), 'utf8'))
    // NOTE: `index: undefined`, so `/` reaches the page, never the raw template.
    const files = yield* HttpStaticServer.make({ root: resolve(dist), index: undefined })
    return {
      files: Effect.map(files, HttpServerResponse.setHeader('x-content-type-options', 'nosniff')),
      pages: async () => request => handleRequest(request, { renderPage, template }),
    }
  })
}

const pageResponse = (assets: Assets, request: HttpServerRequest.HttpServerRequest, url: string) =>
  Effect.gen(function* () {
    const handler = yield* Effect.promise(() => assets.pages(url))
    const web = yield* HttpServerRequest.toWeb(request)
    const response = yield* Effect.promise(() => handler(new Request(url, web)))
    return HttpServerResponse.fromWeb(response)
  })

const isRouteNotFound = (error: HttpServerError.HttpServerError): boolean =>
  error.reason._tag === 'RouteNotFound'

const app = (assets: Assets, origin: string) =>
  HttpServerRequest.HttpServerRequest.use(request => {
    // NOTE: refuse an off-origin target before looking for a file. A
    // network-path request such as `//evil.example/../assets/app.js` names
    // another host, then a path that exists on disk. The page handler trusts
    // the `Request.url` it is given, so this is the one place that resolves it.
    const url = resolveRequestUrl(request.url, origin)
    if (url === undefined) return Effect.succeed(HttpServerResponse.empty({ status: 400 }))
    const resolved = new URL(url)
    const normalized = request.modify({ url: `${resolved.pathname}${resolved.search}` })
    const page = pageResponse(assets, normalized, url)
    // `/` and `/index.html` are the page, never the raw template, and only GET
    // and HEAD read a file; the entry answers every other method.
    const response = Match.value(normalized.method).pipe(
      Match.whenOr('GET', 'HEAD', () =>
        resolvesToIndexHtml(url)
          ? page
          : assets.files.pipe(Effect.catchIf(isRouteNotFound, () => page)),
      ),
      Match.orElse(method =>
        isHostSettledMethod(method)
          ? Effect.succeed(
              HttpServerResponse.empty({
                status: HOST_METHOD_ANSWERS.refusedStatus,
                headers: { allow: HOST_METHOD_ANSWERS.allow },
              }),
            )
          : page,
      ),
    )
    return Effect.provideService(response, HttpServerRequest.HttpServerRequest, normalized)
  })

/**
 * The server, listening on `port` (0 for any free one) at 127.0.0.1. `origin`
 * is the origin this deployment serves, `http://localhost:<port>` unless
 * given: a proxy or a TLS terminator in front names its public one.
 */
export const host = (options: {
  readonly port: number
  readonly origin: Option.Option<string>
  readonly assets: AssetsOf
}) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const { address } = yield* HttpServer.HttpServer
      const port = address._tag === 'UnixPathAddress' ? options.port : address.port
      const origin = Option.getOrElse(options.origin, () => `http://localhost:${port}`)
      return HttpServer.serve(app(yield* options.assets, origin))
    }),
  ).pipe(
    Layer.provideMerge(
      NodeHttpServer.layer(createServer, { port: options.port, host: '127.0.0.1' }),
    ),
  )

/** The host started outside a runtime of its own, as a test starts it: its address, and how to stop it. */
export const startServer = (options: Parameters<typeof host>[0]) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      const services = yield* Layer.buildWithScope(host(options), scope)
      const { address } = Context.get(services, HttpServer.HttpServer)
      return {
        url: address._tag === 'UnixPathAddress' ? address.path : `http://127.0.0.1:${address.port}`,
        close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
      }
    }),
  )

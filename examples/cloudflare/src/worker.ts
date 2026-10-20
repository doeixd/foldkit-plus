/**
 * The Cloudflare worker: one process, four routes.
 *
 * - `POST /remote` answers Remote reads, queries, and live streams from D1,
 *   each request authenticated by its own header.
 * - `/_image/` serves image variants from R2, and `POST /_media/upload` takes
 *   an original into it.
 * - `/sync` upgrades into the Todos Durable Object, the document's single
 *   writer: exchanges append to the D1 journal, and `settle` applies what
 *   committed to the todos table, which is what Remote reads back — and what
 *   its polling live source re-reads. What crosses requests here is D1;
 *   no in-memory push could reach another request's stream.
 */
import { Effect, Layer } from 'effect'
import { DurableObject } from 'cloudflare:workers'
import type {
  CacheStorage,
  D1Database,
  DurableObjectNamespace,
  ImagesBinding,
  R2Bucket,
  RateLimit,
} from '@cloudflare/workers-types'
import {
  admissionRateLimit,
  inspectorImages,
  originalsR2,
  transformerImages,
  uploadsR2,
  variantsR2,
} from 'foldkit-media/cloudflare'
import {
  UploadForbidden,
  UploadPolicy,
  serveFetch as serveImages,
  serveUploadFetch,
} from 'foldkit-media/server'
import { defineDocumentHost } from 'foldkit-sync/do'
import { serveFetch } from 'foldkit-remote-server/fetch'
import { databaseFrom, makeServer, openTodosJournal, settleTodos, Todos } from './schema.js'

export interface WorkerEnv {
  readonly DB: D1Database
  readonly SYNC_HOST: DurableObjectNamespace
  readonly MEDIA: R2Bucket
  readonly IMAGES: ImagesBinding
  readonly LIMITER: RateLimit
}

const { server } = makeServer()

/**
 * The actor is a header when the caller can set one, and a query otherwise.
 * A browser `WebSocket` cannot set headers, so the page passes `?actor=`.
 */
const actorOf = (request: Request): string => {
  const header = request.headers.get('x-actor')
  if (header !== null && header.length > 0) return header
  const query = new URL(request.url).searchParams.get('actor')
  if (query !== null && query.length > 0) return query
  return 'anon'
}

const answerRemote = serveFetch({
  server,
  // A short heartbeat: an idle stream must keep moving to survive.
  liveHeartbeat: '1 second',
  resolvePrincipal: request => Effect.succeed(actorOf(request)),
  layer: (env: WorkerEnv) => databaseFrom(env.DB),
})

export class SyncHost extends defineDocumentHost(DurableObject, {
  sync: Todos,
  openJournal: (_ctx, env: WorkerEnv) => openTodosJournal(env.DB),
  resolvePrincipal: request => Effect.succeed(actorOf(request)),
  settle: (env: WorkerEnv, journal) => settleTodos(journal, env.DB),
}) {}

/** The Pages origin calls this worker from another host. Sockets need no CORS. */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, x-actor',
  'access-control-allow-methods': 'POST, OPTIONS',
} as const

const withCors = (response: Response): Response => {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(CORS)) headers.set(name, value)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * Image variants: originals by hash in R2, resized by the Images binding,
 * kept in R2 behind the edge cache. The page writes their URLs with
 * `Provider.hosted`.
 */
const answerImages = serveImages<WorkerEnv>({
  layer: env =>
    Layer.mergeAll(
      originalsR2(env.MEDIA),
      transformerImages(env.IMAGES),
      // The page's `caches` is typed by the DOM library, which has no `default`.
      variantsR2(env.MEDIA, { cache: (caches as unknown as CacheStorage).default }),
      admissionRateLimit(env.LIMITER),
    ),
})

/**
 * Uploads: an original into R2 under its hash, its facts read by the Images
 * binding and answered for the page to keep. Any named actor may upload; an
 * application asks its session here, through `foldkit-guard`.
 */
const answerUploads = serveUploadFetch<WorkerEnv>({
  layer: env =>
    Layer.mergeAll(
      uploadsR2(env.MEDIA),
      inspectorImages(env.IMAGES),
      Layer.succeed(UploadPolicy, {
        admit: request => {
          const actor = request.headers['x-actor']
          return actor === undefined || actor === '' || actor === 'anon'
            ? Effect.fail(new UploadForbidden({}))
            : Effect.void
        },
      }),
    ),
})

export default {
  fetch: async (request: Request, env: WorkerEnv): Promise<Response> => {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/_image/')) return answerImages(request, env)
    if (url.pathname === '/_media/upload' && request.method === 'POST')
      return answerUploads(request, env)
    if (url.pathname === '/sync')
      // Two fetch universes meet here, as in the sync package's worker
      // fixture: the wire shape is identical; only the brands differ.
      return env.SYNC_HOST.get(env.SYNC_HOST.idFromName('todos')).fetch(
        request as never,
      ) as unknown as Promise<Response>
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    return withCors(await answerRemote(request, env))
  },
}

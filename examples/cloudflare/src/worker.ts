/**
 * The Cloudflare worker: one process, six routes.
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
 * - `/auth/…` are Yielded Auth's routes (sign up, sign in, sign out), and
 *   `/me` answers who the request's session cookie is: both over D1, for the
 *   page at `AUTH_ORIGIN` (`auth.ts`, `authRoutes.ts`).
 */
import { Effect, Layer, Option } from 'effect'
import { DurableObject } from 'cloudflare:workers'
import type {
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
import { serveFetch, uploadPolicyBearer } from 'foldkit-media/server'
import { defineDocumentHost } from 'foldkit-sync/do'
import { serveFetch as serveRemote } from 'foldkit-remote-server/fetch'
import { authOf } from './authRoutes.js'
import { databaseFrom, makeServer, openTodosJournal, settleTodos, Todos } from './schema.js'

export interface WorkerEnv {
  readonly DB: D1Database
  readonly SYNC_HOST: DurableObjectNamespace
  readonly MEDIA: R2Bucket
  readonly IMAGES: ImagesBinding
  readonly LIMITER: RateLimit
  /**
   * The bearer token an upload must carry (`wrangler secret put UPLOAD_TOKEN`). Unset, every
   * upload is refused: an upload writes up to 20 MB into R2, and `x-actor` proves nothing.
   */
  readonly UPLOAD_TOKEN?: string
  /**
   * The origin of the page that signs people in (`https://app.example`).
   * Unset, `/auth/…` and `/me` answer 404: a session cookie is trusted only
   * from a request that shows it came from that page.
   */
  readonly AUTH_ORIGIN?: string
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

const answerRemote = serveRemote({
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

/**
 * Auth, built on the first request that asks for it and kept for the
 * isolate's life. A build that failed is forgotten, so the next request
 * tries again rather than failing for good.
 */
let auth: Option.Option<ReturnType<typeof authOf>> = Option.none()

const authFor = (db: D1Database, origin: string) =>
  Option.getOrElse(auth, () => {
    const building = authOf(db, origin)
    auth = Option.some(building)
    building.catch(() => {
      auth = Option.none()
    })
    return building
  })

/** Yielded's routes and `/me`, or a 404 where no page origin is set. */
const answerAuth = async (request: Request, env: WorkerEnv, pathname: string) => {
  if (env.AUTH_ORIGIN === undefined)
    return new Response('Auth is off: set AUTH_ORIGIN.', { status: 404 })
  const routes = await authFor(env.DB, env.AUTH_ORIGIN)
  return pathname === '/me' ? routes.me(request) : routes.auth(request)
}

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
 * Every path outside the media routes: auth's own, `/sync`, which upgrades
 * into the Durable Object, and Remote for the rest, with CORS for the Pages
 * origin.
 */
const answerApp = async (request: Request, env: WorkerEnv): Promise<Response> => {
  const { pathname } = new URL(request.url)
  if (pathname === '/me' || pathname.startsWith('/auth/')) return answerAuth(request, env, pathname)
  if (pathname === '/sync')
    // Two fetch universes meet here, as in the sync package's worker
    // fixture: the wire shape is identical; only the brands differ.
    return env.SYNC_HOST.get(env.SYNC_HOST.idFromName('todos')).fetch(
      request as never,
    ) as unknown as Promise<Response>
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  return withCors(await answerRemote(request, env))
}

/**
 * The media routes first. Variants: originals by hash in R2, resized by the
 * Images binding, kept in R2 behind the edge cache; the page writes their
 * URLs with `Provider.hosted()`. Uploads: an original into R2 under its hash,
 * its facts read by the Images binding and answered for the page to keep.
 * Only a request bearing the `UPLOAD_TOKEN` secret may upload; an application
 * asks its session here instead, through `foldkit-guard`.
 */
const answer = serveFetch<WorkerEnv>({
  images: {
    layer: env =>
      Layer.mergeAll(
        originalsR2(env.MEDIA),
        transformerImages(env.IMAGES),
        variantsR2(env.MEDIA, { cache: true }),
        admissionRateLimit(env.LIMITER),
      ),
  },
  uploads: {
    layer: env =>
      Layer.mergeAll(
        uploadsR2(env.MEDIA),
        inspectorImages(env.IMAGES),
        uploadPolicyBearer(env.UPLOAD_TOKEN),
      ),
  },
  otherwise: answerApp,
})

export default { fetch: answer }

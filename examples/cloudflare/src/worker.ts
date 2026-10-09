/**
 * The Cloudflare worker: one process, two routes.
 *
 * - `POST /remote` answers Remote reads, queries, and live streams from D1,
 *   each request authenticated by its own header.
 * - `/sync` upgrades into the Todos Durable Object, the document's single
 *   writer: exchanges append to the D1 journal, and `settle` applies what
 *   committed to the todos table, which is what Remote reads back — and what
 *   its polling live source re-reads. What crosses requests here is D1;
 *   no in-memory push could reach another request's stream.
 */
import { DurableObject } from 'cloudflare:workers'
import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types'
import { defineDocumentHost } from 'foldkit-sync/do'
import { serveFetch } from 'foldkit-remote-server/fetch'
import { databaseFrom, makeServer, openTodosJournal, settleTodos, Todos } from './schema.js'

export interface WorkerEnv {
  readonly DB: D1Database
  readonly SYNC_HOST: DurableObjectNamespace
}

const { server } = makeServer()

const answerRemote = serveFetch({
  server,
  // A short heartbeat: an idle stream must keep moving to survive.
  liveHeartbeat: '1 second',
  resolvePrincipal: request => request.headers.get('x-actor') ?? 'anon',
  layer: (env: WorkerEnv) => databaseFrom(env.DB),
})

export class SyncHost extends defineDocumentHost(DurableObject, {
  sync: Todos,
  openJournal: (_ctx, env: WorkerEnv) => openTodosJournal(env.DB),
  resolvePrincipal: request => request.headers.get('x-actor') ?? 'anon',
  settle: (env: WorkerEnv, journal) => settleTodos(journal, env.DB),
}) {}

export default {
  fetch: async (request: Request, env: WorkerEnv): Promise<Response> => {
    const url = new URL(request.url)
    if (url.pathname === '/sync')
      // Two fetch universes meet here, as in the sync package's worker
      // fixture: the wire shape is identical; only the brands differ.
      return env.SYNC_HOST.get(env.SYNC_HOST.idFromName('todos')).fetch(
        request as never,
      ) as unknown as Promise<Response>
    return answerRemote(request, env)
  },
}

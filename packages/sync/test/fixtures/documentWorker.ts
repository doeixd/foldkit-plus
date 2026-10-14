/**
 * Test worker behind the miniflare document-host test: one Durable Object
 * serving the Todos document's exchange, journaled on the worker's D1.
 * Bundled with esbuild (workspace sources) because miniflare runs plain JS.
 */
import * as D1Client from '@effect/sql-d1/D1Client'
import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types'
import { DurableObject } from 'cloudflare:workers'
import { Context, Effect, Layer, Scope } from 'effect'
import { actorId, Journal, opId } from 'foldkit-durable/core'
import { RemoteUnauthenticated } from 'foldkit-remote'
import type { Operation, Sync } from 'foldkit-sync'
import { defineDocumentHost } from 'foldkit-sync/do'
import { Message, Todos } from './todos-contract.js'

interface Env {
  readonly DB: D1Database
  readonly SYNC_HOST: DurableObjectNamespace
}

type Shared = typeof Todos extends Sync<Message, infer S> ? S : never
const TodosJournal = Journal.define<Operation, Shared, string>('app/todos')

const openTodosJournal = async (db: D1Database) => {
  const live = TodosJournal.layer({
    ...Todos.journalContract(),
    d1: true,
    opId: operation => opId(operation.opId),
    actorId: principal => actorId(principal),
  }).pipe(Layer.provide(D1Client.layer({ db })))
  // The scope outlives the open: it lives with the isolate, which workerd
  // evicts wholesale. Closing it would close the journal mid-document.
  const scope = Effect.runSync(Scope.make())
  const context = await Effect.runPromise(Layer.buildWithScope(live, scope))
  return Context.get(context, TodosJournal.tag)
}

/**
 * Actors whose session a later request revoked: the object's own memory, so
 * a socket's revalidation, timed by the upgrade request, reads what another
 * request wrote.
 */
const revoked = new Set<string>()

export class SyncHost extends defineDocumentHost(DurableObject, {
  sync: Todos,
  openJournal: (_ctx, env: Env) => openTodosJournal(env.DB),
  resolvePrincipal: request => {
    const actor = request.headers.get('x-actor') ?? 'anon'
    return revoked.has(actor)
      ? Effect.fail(new RemoteUnauthenticated({ message: 'Session revoked' }))
      : Effect.succeed(actor)
  },
  revalidate: { every: '50 millis' },
}) {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== '/revoke') return super.fetch(request)
    revoked.add(url.searchParams.get('actor') ?? '')
    return new Response(null, { status: 204 })
  }
}

export default {
  fetch: async (request: Request, env: Env): Promise<Response> => {
    const url = new URL(request.url)
    if (url.pathname !== '/sync' && url.pathname !== '/revoke')
      return Response.json({ error: 'not found' }, { status: 404 })
    const stub = env.SYNC_HOST.get(env.SYNC_HOST.idFromName('todos'))
    // Two fetch universes meet here: the DOM request this handler receives
    // and the worker runtime's stub. The wire shape is identical; only the
    // brands differ, which no code here can construct.
    return stub.fetch(request as never) as unknown as Promise<Response>
  },
}

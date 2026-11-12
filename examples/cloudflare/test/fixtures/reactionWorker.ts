/**
 * The Worker behind `reactions.test.ts`: the example's bindings, with a
 * Durable Object whose one reaction is slow enough to be cut off. Each run
 * writes a `reaction_calls` row as it starts, and a `notices` row, the
 * external call, after a second and a half; `/evict` resets the object, as
 * workerd does to an idle one, killing what it runs.
 */
import * as D1Client from '@effect/sql-d1/D1Client'
import type { D1Database } from '@cloudflare/workers-types'
import { DurableObject } from 'cloudflare:workers'
import { Context, Effect, Layer, Schema, Scope } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { actorId, Journal, opId } from 'foldkit-durable/core'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { DocumentId, Sync, type Operation } from 'foldkit-sync'
import { defineDocumentHost } from 'foldkit-sync/do'
import { reaction } from 'foldkit-sync/journal'

interface Env {
  readonly DB: D1Database
  readonly SYNC_HOST: {
    idFromName(name: string): unknown
    get(id: unknown): { fetch(request: Request): Promise<Response> }
  }
}

const Note = Schema.Struct({ id: Schema.String, noticed: Schema.Boolean })
const Model = Schema.Struct({ notes: Schema.Array(Note) })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  Wrote: { id: Schema.String },
  Noticed: { id: Schema.String },
})
type Message = typeof Message.Type
const App = Surface.application({
  Model,
  Message,
  initial: { notes: [] },
  update: (model: Model, message: Message): Update.Return<Model, Message> =>
    Message.match<Update.Return<Model, Message>>(message, {
      Wrote: ({ id }) => ({ model: { notes: [...model.notes, { id, noticed: false }] } }),
      Noticed: ({ id }) => ({
        model: {
          notes: model.notes.map(note => (note.id === id ? { ...note, noticed: true } : note)),
        },
      }),
    }),
})
const Wrote = MessageSet.make(App, [Message.Wrote])
const Noticed = MessageSet.make(App, [Message.Noticed])
const Notes = Sync.forApplication(App).make({
  documentId: DocumentId.make('notes'),
  shared: Projection.pick(App.model.notes),
  durable: Wrote,
  serverOnly: Noticed,
})
type Shared = Parameters<typeof Notes.replay>[0]

const run = (db: D1Database, sql: string, ...values: ReadonlyArray<string>) =>
  Effect.promise(() =>
    db
      .prepare(sql)
      .bind(...values)
      .run(),
  )

const notice = (db: D1Database) =>
  reaction(Notes, {
    name: 'notice',
    on: Wrote,
    appends: Noticed,
    run: ({ message, key }) =>
      Effect.gen(function* () {
        yield* run(db, 'CREATE TABLE IF NOT EXISTS reaction_calls (key TEXT NOT NULL)')
        yield* run(db, 'CREATE TABLE IF NOT EXISTS notices (key TEXT NOT NULL)')
        yield* run(db, 'INSERT INTO reaction_calls (key) VALUES (?)', key)
        yield* Effect.sleep('1500 millis')
        yield* run(db, 'INSERT INTO notices (key) VALUES (?)', key)
        return [Message.Noticed({ id: message.id })]
      }),
  })

const openNotesJournal = async (db: D1Database) => {
  const NotesJournal = Journal.define<Operation, Shared, string>('test/notes')
  const live = NotesJournal.layer({
    ...Notes.journalContract(),
    d1: true,
    opId: operation => opId(operation.opId),
    actorId: principal => actorId(principal),
  }).pipe(Layer.provide(D1Client.layer({ db })))
  const scope = Effect.runSync(Scope.make())
  const context = await Effect.runPromise(Layer.buildWithScope(live, scope))
  return Context.get(context, NotesJournal.tag)
}

export class SyncHost extends defineDocumentHost(DurableObject, {
  sync: Notes,
  openJournal: (_ctx, env: Env) => openNotesJournal(env.DB),
  resolvePrincipal: request => Effect.succeed(request.headers.get('x-actor') ?? 'anon'),
  server: { principal: 'notes-server', reactions: (env: Env) => [notice(env.DB)] },
}) {
  private readonly state: { abort(reason?: string): void }

  constructor(ctx: { readonly storage?: unknown; abort(reason?: string): void }, env: Env) {
    super(ctx, env)
    this.state = ctx
  }

  override async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== '/evict') return super.fetch(request)
    this.state.abort('evicted')
    return new Response(null, { status: 204 })
  }
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> =>
    env.SYNC_HOST.get(env.SYNC_HOST.idFromName('notes')).fetch(request),
}

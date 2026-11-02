// @vitest-environment node
/**
 * A guarded read at the edge (#428): a read whose rule mentions the viewer
 * is never kept, and the two-principal checker passes over a set holding it
 * beside a public read; were it kept (answered as the visitor), the owner
 * would read the visitor's answer, which the checker refuses.
 */
import { Effect, Layer, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr } from 'foldkit-entity'
import { CacheStore, EdgeCache, REMOTE_PROTOCOL_VERSION, Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { checkCache, serveFetch } from 'foldkit-remote-server/fetch'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const User = Schema.Struct({ id: Schema.String })
type User = typeof User.Type

const fresh = Entity.annotate(EdgeCache.of({ maxAge: '60 seconds' }))
const NoteFields = Entity.define(
  'Note',
  Schema.Struct({ id: Schema.String, ownerId: Schema.String, text: Schema.String }),
).pipe(fresh)
const Price = Entity.define(
  'Price',
  Schema.Struct({ id: Schema.String, amount: Schema.Number }),
).pipe(fresh)

const G = Guards.declare(
  'Notes',
  User,
  guard => ({ isOwner: guard.row(NoteFields, p => Expr.eq(NoteFields.fields.ownerId, p.id)) }),
  { key: user => user.id, unguarded: 'allow' },
)
const Policy = G.implement({})
const Note = NoteFields.pipe(Guards.attach(G, { row: { Read: [G.isOwner] } }))

const App = Surface.application({
  Model: Schema.Struct({ remote: Remote.Model }),
  Message: defineMessageUnion({ ...Remote.messages }),
})
const domain = Remote.make({ model: App.model.remote, entities: [Note, Price] })
const backend = RemoteServer.memory<Option.Option<User>>({
  domain,
  rows: {
    Note: [{ id: 'n1', ownerId: 'ada', text: 'Ada’s own' }],
  },
  ...GuardServer.memory(Policy, [Note]),
})

// Prices are served apart, with no rule: a memory backend's `readable` reaches every Entity it serves.
const server = RemoteServer.make({
  entities: [
    backend.server.entities.get('Note')!,
    RemoteServer.entity<Option.Option<User>>(Price, {
      read: ({ ids }) => Effect.succeed(ids.map(id => ({ id, values: { id, amount: 12 } }))),
    }),
  ],
})

const visitor: Option.Option<User> = Option.none()
const config = {
  server,
  resolvePrincipal: (request: Request) =>
    Effect.succeed(Option.map(Option.fromNullishOr(request.headers.get('x-user')), id => ({ id }))),
  layer: () => Layer.empty,
}

const reading = (entity: string, id: string, fields: ReadonlyArray<string>, user?: string) => () =>
  new Request('https://notes.test/remote', {
    method: 'POST',
    headers: user === undefined ? {} : { 'x-user': user },
    body: JSON.stringify({
      operation: 'read',
      payload: { version: REMOTE_PROTOCOL_VERSION, requests: [{ entity, id, fields }] },
    }),
  })
const note = (user?: string) => reading('Note', 'n1', ['text'], user)

describe('a read under a guard rule that mentions the viewer', () => {
  it('is never kept, and its owner reads their own row', async () => {
    const store = CacheStore.memory()
    const serve = serveFetch({ ...config, cache: { store, visitor } })
    for (const _ of [1, 2]) {
      const answer = await serve(note('ada')(), undefined)
      expect(answer.headers.get('cache-control')).toBe('private, no-store')
      const body: { readonly result: { readonly entities: ReadonlyArray<unknown> } } =
        await answer.json()
      expect(body.result.entities).toHaveLength(1)
    }
    expect(store.size()).toBe(0)
  })

  it('passes the two-principal checker beside a public read', async () => {
    await checkCache(
      { ...config, cache: { visitor } },
      [
        reading('Price', 'p1', ['amount']),
        reading('Price', 'p1', ['amount'], 'ada'),
        note(),
        note('ada'),
      ],
      undefined,
    )
  })
})

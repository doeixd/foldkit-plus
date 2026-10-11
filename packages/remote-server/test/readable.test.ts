// @vitest-environment node
/**
 * What a principal may see of rows, through the real handlers: `memory`'s
 * `readable` hides a row everywhere it could appear, and a source's `filter`
 * drops or replaces a member per record.
 */
import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import { RpcTest } from 'effect/rpc'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Order, Relation } from 'foldkit-entity'
import { Query, REMOTE_PROTOCOL_VERSION, Remote, RemoteRpc, type Requirement } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { RemoteServer, type EntityRecord, type MemoryReadable } from '../src/index.js'

const UserBase = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const NoteBase = Entity.define(
  'Note',
  Schema.Struct({ id: Schema.String, ownerId: Schema.String, body: Schema.String }),
)
const { User, Note } = Entity.relate(
  { User: UserBase, Note: NoteBase },
  { Note: { author: Relation.one(UserBase), readers: Relation.many(UserBase) } },
)

const AllNotes = Query.define('AllNotes', {}, () =>
  Query.from(Note).pipe(Query.orderBy(Order.asc(Note.fields.id))),
)
const ByBody = Query.define('ByBody', { body: Schema.String }, ({ input }) =>
  Query.from(Note).pipe(
    Query.where(Expr.eq(Note.fields.body, input.body)),
    Query.orderBy(Order.asc(Note.fields.id)),
  ),
)

const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const domain = Remote.make({
  model: App.model.remote,
  entities: [User, Note],
  queries: [AllNotes, ByBody],
})

const rows = {
  User: [
    { id: 'ada', name: 'Ada' },
    { id: 'grace', name: 'Grace' },
  ],
  Note: [
    {
      id: 'n1',
      ownerId: 'ada',
      body: 'x',
      author: 'User:ada',
      readers: ['User:ada', 'User:grace'],
    },
    { id: 'n2', ownerId: 'grace', body: 'x', author: 'User:grace', readers: ['User:grace'] },
  ],
}

/** Each principal reads its own notes and its own user row. */
const ownRows =
  (principal: string): MemoryReadable =>
  (entity, row) =>
    entity === 'Note' ? row['ownerId'] === principal : row['id'] === principal

const handlers = (principal: string) =>
  RemoteServer.handlers(
    RemoteServer.memory({
      domain,
      rows,
      principal,
      readable: who => Effect.succeed(ownRows(who)),
    }).server,
    principal,
  )

const read = (principal: string, requests: ReadonlyArray<Requirement>) =>
  Effect.runPromise(
    handlers(principal).FoldkitRemoteRead({ version: REMOTE_PROTOCOL_VERSION, requests }),
  )

const ids = (principal: string, query: string, input: Readonly<Record<string, unknown>>) =>
  Effect.runPromise(
    handlers(principal).FoldkitRemoteQuery({ query, input, window: {}, select: undefined }),
  ).then(page => page.edges.map(edge => edge.id))

describe('RemoteServer.memory with readable', () => {
  it('answers a read by id only for a row the principal may read', async () => {
    const result = await read('ada', [
      { entity: 'Note', id: 'n1', fields: ['body'] },
      { entity: 'Note', id: 'n2', fields: ['body'] },
    ])
    expect(result.entities.map(entity => entity.id)).toEqual(['n1'])
    // Absent, not withheld: the client reads it as not found.
    expect(result.settled).toEqual([])
  })

  it('leaves a row the principal may not read out of every query', async () => {
    expect(await ids('ada', 'AllNotes', {})).toEqual(['n1'])
    expect(await ids('grace', 'ByBody', { body: 'x' })).toEqual(['n2'])
  })

  it('drops a ref to a row the principal may not read', async () => {
    const result = await read('grace', [
      { entity: 'Note', id: 'n2', fields: ['author', 'readers'] },
    ])
    expect(result.entities[0]?.values).toEqual({ author: 'User:grace', readers: ['User:grace'] })
    const ada = await read('ada', [{ entity: 'Note', id: 'n1', fields: ['author', 'readers'] }])
    expect(ada.entities[0]?.values).toEqual({ author: 'User:ada', readers: ['User:ada'] })
    const hidden = RemoteServer.memory({
      domain,
      rows: { ...rows, Note: [{ ...rows.Note[0]!, author: 'User:grace' }] },
      principal: 'ada',
      readable: who => Effect.succeed(ownRows(who)),
    })
    const answer = await Effect.runPromise(
      RemoteServer.handlers(hidden.server, 'ada').FoldkitRemoteRead({
        version: REMOTE_PROTOCOL_VERSION,
        requests: [{ entity: 'Note', id: 'n1', fields: ['author', 'ownerId'] }],
      }),
    )
    expect(answer.entities[0]?.values).toEqual({ author: null, ownerId: 'ada' })
  })
})

/** Another's note shows its body as an ellipsis. */
const redacting = {
  Note: (principal: string, fields: ReadonlyArray<string>) =>
    Effect.succeed({
      // `ownerId` decides the body, so it is read even when not asked for.
      fields: [...new Set([...fields, 'ownerId'])],
      apply: (record: EntityRecord) => {
        const { body, ...rest } = record.values
        if (record.values['ownerId'] === principal) return record
        return { ...record, values: fields.includes('body') ? { ...rest, body: '…' } : rest }
      },
    }),
}

describe('RemoteServer.memory with a readable that follows a relation', () => {
  it('looks the related row up by id', async () => {
    // A note is readable when its author's row says so.
    const backend = RemoteServer.memory({
      domain,
      rows: {
        User: [
          { id: 'ada', name: 'Ada' },
          { id: 'grace', name: 'Grace', hidden: true },
        ],
        Note: rows.Note,
      },
      principal: 'anyone',
      readable: (_, row) =>
        Effect.succeed((entity, values) => {
          if (entity !== 'Note') return true
          const author = String(values['author']).slice('User:'.length)
          return Option.match(row('User', author), {
            onNone: () => false,
            onSome: user => user['hidden'] !== true,
          })
        }),
    })
    const page = await Effect.runPromise(
      RemoteServer.handlers(backend.server, 'anyone').FoldkitRemoteQuery({
        query: 'AllNotes',
        input: {},
        window: {},
        select: undefined,
      }),
    )
    expect(page.edges.map(edge => edge.id)).toEqual(['n1'])
  })
})

describe('EntitySource.filter', () => {
  const server = RemoteServer.memory({ domain, rows, principal: 'ada', filter: redacting }).server

  it('replaces a member per record, reading what the decision needs', async () => {
    const result = await Effect.runPromise(
      RemoteServer.handlers(server, 'ada').FoldkitRemoteRead({
        version: REMOTE_PROTOCOL_VERSION,
        requests: [
          { entity: 'Note', id: 'n1', fields: ['body'] },
          { entity: 'Note', id: 'n2', fields: ['body'] },
        ],
      }),
    )
    expect(result.entities.map(entity => [entity.id, entity.values])).toEqual([
      ['n1', { body: 'x' }],
      ['n2', { body: '…' }],
    ])
  })

  it('decides a live patch as it decides a read', async () => {
    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub([...server.entities.values()])
        const fiber = yield* Effect.forkChild(
          Effect.gen(function* () {
            const client = yield* RpcTest.makeClient(RemoteRpc)
            return yield* client
              .FoldkitRemoteLive({
                version: REMOTE_PROTOCOL_VERSION,
                requirements: [{ entity: 'Note', id: 'n2', fields: ['body'] }],
                after: 0,
              })
              .pipe(Stream.take(1), Stream.runCollect)
          }).pipe(
            Effect.scoped,
            Effect.provide(RemoteRpc.toLayer(RemoteServer.handlers(server, 'ada', { live: hub }))),
          ),
        )
        for (let i = 0; i < 5; i++) yield* Effect.yieldNow
        yield* hub.changed({ entity: 'Note', id: 'n2' }, ['body'])
        return [...(yield* Fiber.join(fiber))]
      }),
    )
    expect(events).toMatchObject([{ _tag: 'EntityPatched', id: 'n2', values: { body: '…' } }])
  })

  it('settles a member the plan drops, as one the source did not return', async () => {
    const dropping = RemoteServer.memory({
      domain,
      rows,
      principal: 'ada',
      filter: {
        Note: (_, fields) =>
          Effect.succeed({
            fields,
            apply: record => ({ ...record, values: { ...record.values, body: undefined } }),
          }),
      },
    })
    const result = await Effect.runPromise(
      RemoteServer.handlers(dropping.server, 'ada').FoldkitRemoteRead({
        version: REMOTE_PROTOCOL_VERSION,
        requests: [{ entity: 'Note', id: 'n1', fields: ['body', 'ownerId'] }],
      }),
    )
    expect(result.entities[0]?.values).toEqual({ ownerId: 'ada', body: undefined })
  })

  it('refuses a filter for an Entity the domain does not declare', () => {
    expect(() =>
      RemoteServer.memory({
        domain,
        rows,
        principal: 'ada',
        filter: { Post: (_, fields) => Effect.succeed({ fields, apply: record => record }) },
      }),
    ).toThrow(/`filter` names "Post"/)
  })
})

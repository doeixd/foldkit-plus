/**
 * A `one` relation as an operand, compiled to the column it is stored on, and
 * read by the memory server from its ref keys: the two agree. A relation
 * stored on the other table is refused where the body is registered.
 * operations-phase3-DESIGN.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Order, Query as Body, Relation } from 'foldkit-entity'
import { Query, Remote } from 'foldkit-remote'
import { RemoteServer, type ServerDefinition } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { bind, databaseLayer, query, source, type DrizzleDatabase } from '../src/index.js'

const users = sqliteTable('users', { id: text('id').primaryKey() })
const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  reviewerId: text('reviewer_id'),
})

const Fields = {
  User: Entity.define('User', Schema.Struct({ id: Schema.String })),
  Note: Entity.define('Note', Schema.Struct({ id: Schema.String })),
}
const { User, Note } = Entity.relate(Fields, {
  Note: {
    owner: Relation.one(Fields.User),
    reviewer: Relation.one(Fields.User, { optional: true }),
  },
  User: {
    notes: Relation.many(Fields.Note),
    reviewing: Relation.one(Fields.Note, { optional: true }),
  },
})

const byId = Order.asc(Note.fields.id)
const Mine = Query.define('Mine', {}, () =>
  Body.from(Note).pipe(
    Body.where(Expr.eq(Note.relations.owner, Expr.viewer(User))),
    Body.orderBy(byId),
  ),
)
const OwnedBy = Query.define('OwnedBy', { owner: Schema.String }, ({ input }) =>
  Body.from(Note).pipe(Body.where(Expr.eq(Note.relations.owner, input.owner)), Body.orderBy(byId)),
)
const Unreviewed = Query.define('Unreviewed', {}, () =>
  Body.from(Note).pipe(Body.where(Expr.isNull(Note.relations.reviewer)), Body.orderBy(byId)),
)

const Db = bind(
  { User, Note },
  {
    User: {
      table: users,
      relations: {
        notes: { foreignKey: notes.ownerId },
        reviewing: { foreignKey: notes.reviewerId, optional: true, assumeUnique: true },
      },
    },
    Note: {
      table: notes,
      relations: {
        owner: { field: notes.ownerId },
        reviewer: { field: notes.reviewerId, optional: true },
      },
    },
  },
)
const viewer = (principal: string | null) =>
  Option.map(Option.fromNullishOr(principal), id => Remote.ref(User, id))

const drizzled = RemoteServer.make<string | null, DrizzleDatabase>({
  entities: [source(Db.Note)],
  queries: [
    query(Mine, { entity: Db.Note }),
    query(OwnedBy, { entity: Db.Note }),
    query(Unreviewed, { entity: Db.Note }),
  ],
  viewer,
})
const memory = RemoteServer.memory({
  domain: Remote.define({ entities: [User, Note], queries: [Mine, OwnedBy, Unreviewed] }),
  // The memory rows keep a link as its ref key, as the wire does.
  rows: {
    Note: [
      { id: 'n1', owner: 'User:ada', reviewer: null },
      { id: 'n2', owner: 'User:bo', reviewer: 'User:ada' },
      { id: 'n3', owner: 'User:ada', reviewer: 'User:bo' },
    ],
  },
  viewer,
})

const listed = async (
  name: string,
  input: Readonly<Record<string, unknown>>,
  principal: string | null,
): Promise<ReadonlyArray<string>> => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table users (id text primary key);
    create table notes (id text primary key, owner_id text not null, reviewer_id text);
    insert into notes values ('n1', 'ada', null), ('n2', 'bo', 'ada'), ('n3', 'ada', 'bo');
  `)
  try {
    const page = await Effect.runPromise(
      RemoteServer.handlers(drizzled, principal)
        .FoldkitRemoteQuery({ query: name, input, window: {} })
        .pipe(Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
    return page.edges.map(edge => edge.id)
  } finally {
    sqlite.close()
  }
}

const remembered = async (
  name: string,
  input: Readonly<Record<string, unknown>>,
  principal: string | null,
): Promise<ReadonlyArray<string>> => {
  const served: ServerDefinition<string | null> = memory.server
  const page = await Effect.runPromise(
    RemoteServer.handlers(served, principal).FoldkitRemoteQuery({ query: name, input, window: {} }),
  )
  return page.edges.map(edge => edge.id)
}

describe.each([
  ['SQL', listed],
  ['memory', remembered],
] as const)('a body over a link, through %s', (_, list) => {
  it("compares the id it points at with the viewer's", async () => {
    expect(await list('Mine', {}, 'ada')).toEqual(['n1', 'n3'])
    expect(await list('Mine', {}, 'bo')).toEqual(['n2'])
  })

  it('compares it with an input', async () => {
    expect(await list('OwnedBy', { owner: 'bo' }, null)).toEqual(['n2'])
  })

  it('reads an optional link pointing nowhere as null', async () => {
    expect(await list('Unreviewed', {}, null)).toEqual(['n1'])
  })
})

describe('a link stored on the other table', () => {
  it('is refused where the body is registered', () => {
    const Reviewing = Query.define('Reviewing', {}, () =>
      Body.from(User).pipe(
        Body.where(Expr.isNull(User.relations.reviewing)),
        Body.orderBy(Order.asc(User.fields.id)),
      ),
    )
    expect(() => query(Reviewing, { entity: Db.User })).toThrow(
      'reads the relation "reviewing" as a value, but it is not stored on this table ({ field })',
    )
  })
})

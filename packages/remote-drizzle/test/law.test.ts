/**
 * The law (operations-phase6-DESIGN §1): each declared write of a test domain
 * run through the client's interpreter (`Data.mutate`) and through the
 * server's (`RemoteServer.handlers` over Drizzle), with the same principal and
 * `now`, the client holding every row. Every part the client predicted must
 * equal what the server then holds, on SQLite, on PGlite and, where
 * `FOLDKIT_LOCALE_PG` names one, on a Postgres that collates by a locale.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { sql, type SQL } from 'drizzle-orm'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Clock, Effect, Layer, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Collation, Derived, Entity, Expr, Order, Relation, Write } from 'foldkit-entity'
import { Mutation, Query, Remote } from 'foldkit-remote'
import { Law } from 'foldkit-remote/testing'
import { RemoteServer } from 'foldkit-remote-server'
import { Surface } from 'foldkit-surface'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  bind,
  checkConstraints,
  databaseLayer,
  query,
  source,
  writer,
  type DrizzleDatabase,
} from '../src/index.js'

const TeamFields = Entity.define('Team', Schema.Struct({ id: Schema.String, org: Schema.String }))
const UserFields = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const CardFields = Entity.define(
  'Card',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    rank: Schema.Int,
    votes: Schema.Int,
    org: Schema.String,
    createdAt: Schema.Number,
    editedAt: Schema.Number,
  }),
)
const VoteFields = Entity.define('Vote', Schema.Struct({ id: Schema.String }))
const Board = Entity.relate(
  { Team: TeamFields, User: UserFields, Card: CardFields, Vote: VoteFields },
  {
    User: { team: Relation.one(TeamFields) },
    Card: { author: Relation.one(UserFields) },
    Vote: { card: Relation.one(CardFields), voter: Relation.one(UserFields) },
  },
)
const Team = Board.Team
const User = Board.User.pipe(
  Entity.derived({ cardCount: Derived.count(Board.Card.relations.author) }),
)
// Who made a card, when, and for which organisation, the operation sets from its context.
const Card = Board.Card.pipe(
  Entity.sets(
    {
      author: Expr.viewer(UserFields),
      createdAt: Expr.now,
      org: Expr.path(
        Expr.viewer(Board.User),
        Expr.path(Board.User.relations.team, Team.fields.org),
      ),
    },
    { on: 'create' },
  ),
  Entity.sets({ editedAt: Expr.now }, { on: 'write' }),
  Entity.invariant('rankNotNegative', ({ after }) => Expr.gte(after.rank, 0), {
    message: 'A rank is not negative',
    path: ['rank'],
  }),
  Entity.derived({
    voteCount: Derived.count(Board.Vote.relations.card),
    voted: Derived.exists(Board.Vote.relations.card, { viewer: Board.Vote.relations.voter }),
  }),
)
const Vote = Board.Vote.pipe(Entity.sets({ voter: Expr.viewer(UserFields) }, { on: 'create' }))

const binary = { collation: Collation.binary }
const ByRank = Query.define('ByRank', {}, () =>
  Query.from(Card).pipe(
    Query.orderBy(Order.asc(Card.fields.rank), Order.asc(Card.fields.id, binary)),
  ),
)
const ByTitle = Query.define('ByTitle', {}, () =>
  Query.from(Card).pipe(
    Query.orderBy(Order.desc(Card.fields.title, binary), Order.asc(Card.fields.id, binary)),
  ),
)
const Mine = Query.define('Mine', {}, () =>
  Query.from(Card).pipe(
    Query.where(Expr.eq(Card.relations.author, Expr.viewer(UserFields))),
    Query.orderBy(Order.desc(Card.fields.createdAt), Order.asc(Card.fields.id, binary)),
  ),
)

const CardInput = Schema.Struct({ id: Schema.String, title: Schema.String, rank: Schema.Int })
const AddCard = Mutation.write(
  'AddCard',
  Write.insert(Entity.input(Card, Schema.Struct({ ...CardInput.fields, votes: Schema.Int })), {
    id: 'id',
  }),
)
const EditCard = Mutation.write(
  'EditCard',
  Write.update(Entity.input(Card, CardInput), { id: 'id' }),
)
const Bump = Mutation.write(
  'Bump',
  Write.update(
    Entity.input(Card, Schema.Struct({ id: Schema.String, by: Schema.Int }), {
      by: Entity.unmapped,
    }),
    { id: 'id', increment: { votes: 'by' } },
  ),
)
const DropCard = Mutation.write(
  'DropCard',
  Write.delete(Entity.input(Card, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)
const VoteInput = Schema.Struct({ id: Schema.String, cardId: Schema.String })
const CastVote = Mutation.write(
  'CastVote',
  Write.insert(Entity.input(Vote, VoteInput, { cardId: 'card' }), { id: 'id' }),
)
const MoveVote = Mutation.write(
  'MoveVote',
  Write.update(Entity.input(Vote, VoteInput, { cardId: 'card' }), { id: 'id' }),
)
const Unvote = Mutation.write(
  'Unvote',
  Write.delete(Entity.input(Vote, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)
// Declared by their codecs alone, so the client predicts nothing of them; the
// server answers Ping with nothing and does not serve Lost.
const Ping = Mutation.make('Ping', { Input: {}, Output: {} })
const Lost = Mutation.make('Lost', { Input: {}, Output: {} })
const mutations = [
  AddCard,
  EditCard,
  Bump,
  DropCard,
  CastVote,
  MoveVote,
  Unvote,
  Ping,
  Lost,
] as const

const Model = Schema.Struct({ remote: Remote.Model, me: Schema.String })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Team, User, Card, Vote],
  queries: [ByRank, ByTitle, Mine],
  mutations,
  viewer: model => Option.some(Remote.ref(UserFields, model.me)),
})

const sqliteDb = (() => {
  const teams = sqliteTable('law_teams', {
    id: text('id').primaryKey(),
    org: text('org').notNull(),
  })
  const users = sqliteTable('law_users', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    teamId: text('team_id').notNull(),
  })
  const cards = sqliteTable('law_cards', {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    rank: integer('rank').notNull(),
    votes: integer('votes').notNull(),
    org: text('org').notNull(),
    authorId: text('author_id').notNull(),
    createdAt: integer('created_at').notNull(),
    editedAt: integer('edited_at').notNull(),
  })
  const votes = sqliteTable('law_votes', {
    id: text('id').primaryKey(),
    cardId: text('card_id').notNull(),
    voterId: text('voter_id').notNull(),
  })
  const ledger = sqliteTable('law_ledger', {
    scope: text('scope').notNull(),
    operation: text('operation').notNull(),
    target: text('target').notNull(),
    answer: text('answer').notNull(),
    at: integer('at').notNull(),
    request: text('request'),
  })
  const Db = bind(
    { Team, User, Card, Vote },
    {
      Team: { table: teams },
      User: { table: users, relations: { team: { field: users.teamId } } },
      Card: { table: cards, relations: { author: { field: cards.authorId } } },
      Vote: {
        table: votes,
        relations: { card: { field: votes.cardId }, voter: { field: votes.voterId } },
      },
    },
  )
  // An increment expects no revision, so a retry is told apart by the ledger.
  return { Db, ledger: { table: ledger, scope: (principal: string) => principal } }
})()

const pgDb = (() => {
  const teams = pgTable('law_teams', {
    id: pgText('id').primaryKey(),
    org: pgText('org').notNull(),
  })
  const users = pgTable('law_users', {
    id: pgText('id').primaryKey(),
    name: pgText('name').notNull(),
    teamId: pgText('team_id').notNull(),
  })
  const cards = pgTable('law_cards', {
    id: pgText('id').primaryKey(),
    title: pgText('title').notNull(),
    rank: pgInteger('rank').notNull(),
    votes: pgInteger('votes').notNull(),
    org: pgText('org').notNull(),
    authorId: pgText('author_id').notNull(),
    createdAt: pgInteger('created_at').notNull(),
    editedAt: pgInteger('edited_at').notNull(),
  })
  const votes = pgTable('law_votes', {
    id: pgText('id').primaryKey(),
    cardId: pgText('card_id').notNull(),
    voterId: pgText('voter_id').notNull(),
  })
  const ledger = pgTable('law_ledger', {
    scope: pgText('scope').notNull(),
    operation: pgText('operation').notNull(),
    target: pgText('target').notNull(),
    answer: pgText('answer').notNull(),
    at: pgInteger('at').notNull(),
    request: pgText('request'),
  })
  const Db = bind(
    { Team, User, Card, Vote },
    {
      Team: { table: teams },
      User: { table: users, relations: { team: { field: users.teamId } } },
      Card: { table: cards, relations: { author: { field: cards.authorId } } },
      Vote: {
        table: votes,
        relations: { card: { field: votes.cardId }, voter: { field: votes.voterId } },
      },
    },
  )
  // An increment expects no revision, so a retry is told apart by the ledger.
  return { Db, ledger: { table: ledger, scope: (principal: string) => principal } }
})()

type Bound = typeof sqliteDb | typeof pgDb

/** The server over one dialect's binding; the principal is the User's id. */
const serverOf = ({ Db, ledger }: Bound) =>
  RemoteServer.make<string, DrizzleDatabase>({
    entities: [source(Db.Team), source(Db.User), source(Db.Card), source(Db.Vote)],
    queries: [
      query(ByRank, { entity: Db.Card }),
      query(ByTitle, { entity: Db.Card }),
      query(Mine, { entity: Db.Card }),
    ],
    mutations: [
      RemoteServer.write(AddCard, writer(Db.Card)),
      RemoteServer.write(EditCard, writer(Db.Card)),
      RemoteServer.write(Bump, writer(Db.Card, { ledger })),
      RemoteServer.write(DropCard, writer(Db.Card)),
      RemoteServer.write(CastVote, writer(Db.Vote)),
      RemoteServer.write(MoveVote, writer(Db.Vote)),
      RemoteServer.write(Unvote, writer(Db.Vote)),
      {
        mutation: Ping.name,
        Input: Ping.Input,
        Output: Ping.Output,
        Refusal: Ping.Refusal,
        run: () => Effect.succeed({ output: {}, entities: [], connections: [], deleted: [] }),
      },
    ],
    viewer: principal => Option.some({ entity: 'User', id: principal }),
  })

/** The tables, with the CHECKs the Card's rules compile to, and the rows every case starts from. */
const statements = ({ Db }: Bound): ReadonlyArray<string> => {
  const checks = checkConstraints(Db.Card)
    .constraints.map(({ constraint }) => `, ${constraint}`)
    .join('')
  return [
    'create table law_teams (id text primary key, org text not null)',
    'create table law_users (id text primary key, name text not null, team_id text not null)',
    `create table law_cards (
      id text primary key, title text not null, rank integer not null, votes integer not null,
      org text not null, author_id text not null, created_at integer not null,
      edited_at integer not null${checks}
    )`,
    'create table law_votes (id text primary key, card_id text not null, voter_id text not null)',
    `create table law_ledger (
      scope text not null, operation text not null, target text not null, answer text not null,
      at integer not null, request text, primary key (scope, operation, target)
    )`,
    "insert into law_teams values ('t1', 'acme'), ('t2', 'zeta')",
    "insert into law_users values ('u1', 'Ada', 't1'), ('u2', 'Bo', 't2')",
    `insert into law_cards values
      ('c1', 'alpha', 2, 0, 'acme', 'u1', 100, 100),
      ('c2', 'beta', 5, 1, 'zeta', 'u2', 100, 200),
      ('c3', 'gamma', 1, 0, 'acme', 'u1', 300, 300)`,
    "insert into law_votes values ('v1', 'c1', 'u2'), ('v2', 'c1', 'u1')",
  ]
}

/** When the reader acted; the server's clock reads it too, as a `TestClock` would. */
const NOW = 1_000_000

const stoppedAt = (at: number): Clock.Clock => ({
  currentTimeMillisUnsafe: () => at,
  currentTimeMillis: Effect.succeed(at),
  currentTimeNanosUnsafe: () => BigInt(at) * 1_000_000n,
  currentTimeNanos: Effect.succeed(BigInt(at) * 1_000_000n),
  monotonicTimeNanosUnsafe: () => BigInt(at) * 1_000_000n,
  monotonicTimeNanos: Effect.succeed(BigInt(at) * 1_000_000n),
  sleep: () => Effect.void,
})

const everything = [
  { entity: Team, ids: ['t1', 't2'] },
  { entity: User, ids: ['u1', 'u2'] },
  { entity: Card, ids: ['c1', 'c2', 'c3'] },
  { entity: Vote, ids: ['v1', 'v2'] },
]
const lists = [ByRank.ref({}), ByTitle.ref({}), Mine.ref({})]
const [byRank, byTitle, mine] = lists.map(ref => ref.identity)

interface LawCase {
  readonly what: string
  readonly mutation: (typeof mutations)[number]
  readonly input: unknown
  /** Parts the client must have predicted and the server agreed with: proof each was compared. */
  readonly compares: ReadonlyArray<string>
}

const cases: ReadonlyArray<LawCase> = [
  {
    what: 'a new card: its row, its author, time and organisation, its counts, its lists',
    mutation: AddCard,
    input: { id: 'c9', title: 'delta', rank: 3, votes: 0 },
    compares: [
      'Card:c9.title',
      'Card:c9.author',
      'Card:c9.createdAt',
      'Card:c9.editedAt',
      'Card:c9.org',
      'Card:c9.voteCount',
      'Card:c9.voted',
      'User:u1.cardCount',
      byRank!,
      byTitle!,
      mine!,
    ],
  },
  {
    what: 'an edit: the row, its edit time, and where its lists now put it',
    mutation: EditCard,
    input: { id: 'c1', title: 'omega', rank: 9 },
    compares: ['Card:c1.title', 'Card:c1.rank', 'Card:c1.editedAt', byRank!, byTitle!],
  },
  {
    what: 'an increment, worked out over the held row',
    mutation: Bump,
    input: { id: 'c2', by: 2 },
    compares: ['Card:c2.votes', 'Card:c2.editedAt'],
  },
  {
    what: 'a delete: the row gone, its author counting one fewer, its lists without it',
    mutation: DropCard,
    input: { id: 'c3' },
    compares: ['Card:c3', 'User:u1.cardCount', byRank!, mine!],
  },
  {
    what: 'a vote: its voter, the card counting it, and found by its voter',
    mutation: CastVote,
    input: { id: 'v9', cardId: 'c2' },
    compares: ['Vote:v9.card', 'Vote:v9.voter', 'Card:c2.voteCount', 'Card:c2.voted'],
  },
  {
    what: 'a vote moved: one count down, the other up, found where it went',
    mutation: MoveVote,
    input: { id: 'v2', cardId: 'c3' },
    compares: [
      'Vote:v2.card',
      'Card:c1.voteCount',
      'Card:c1.voted',
      'Card:c3.voteCount',
      'Card:c3.voted',
    ],
  },
  {
    what: 'a vote taken back: the count down, no longer found',
    mutation: Unvote,
    input: { id: 'v2' },
    compares: ['Vote:v2', 'Card:c1.voteCount', 'Card:c1.voted'],
  },
  {
    what: 'an edit the client refuses itself, as the server refuses it',
    mutation: EditCard,
    input: { id: 'c1', title: 'alpha', rank: -1 },
    compares: ['EditCard'],
  },
  {
    what: 'a new card the client refuses itself, as the server refuses it',
    mutation: AddCard,
    input: { id: 'c9', title: 'delta', rank: -3, votes: 0 },
    compares: ['AddCard'],
  },
]

/** One case, as u1. */
const checked = (Db: Bound, layer: Layer.Layer<DrizzleDatabase>, c: LawCase) =>
  Effect.runPromise(
    Law.check(Data, {
      model: { remote: Remote.initial, me: 'u1' },
      holds: everything,
      lists,
      mutation: c.mutation,
      input: c.input,
      now: NOW,
    }).pipe(
      Effect.provide(
        Remote.clientLayer(RemoteServer.handlers(serverOf(Db), 'u1')).pipe(Layer.provide(layer)),
      ),
      Effect.provideService(Clock.Clock, stoppedAt(NOW)),
    ),
  )

/** A seeded database, and how to let it go. */
interface Fresh {
  readonly layer: Layer.Layer<DrizzleDatabase>
  /** Runs one statement past the server, as a write that skips it would. */
  readonly run: (statement: string) => Promise<unknown>
  readonly close: () => Promise<void>
}

/** A card row as the table holds it, with `rank`. */
const cardRow = (rank: number) =>
  `insert into law_cards values ('c8', 'raw', ${rank}, 0, 'acme', 'u1', 1, 1)`

/** The law over one database, each case on a fresh copy of the seed. */
const suite = (Db: Bound, fresh: () => Promise<Fresh>) =>
  it.each(cases.map(c => ({ ...c, name: c.what })))('$name', async c => {
    const { layer, close } = await fresh()
    try {
      const report = await checked(Db, layer, c)
      expect(report.disagreed).toEqual([])
      expect(report.agreed).toEqual(expect.arrayContaining([...c.compares]))
    } finally {
      await close()
    }
  })

/**
 * The CHECKs are the server's last word on the same invariants
 * (operations-phase6-DESIGN §4): a row they refuse is one the client judges
 * invalid, and one they take it does not.
 */
const checksAgree = (fresh: () => Promise<Fresh>) =>
  it.each([
    { rank: -1, valid: false },
    { rank: 4, valid: true },
  ])(
    'a row of rank $rank, written past the server, is refused by the CHECKs only if the client judges it invalid',
    async ({ rank, valid }) => {
      const { run, close } = await fresh()
      try {
        const stored = await run(cardRow(rank)).then(
          () => true,
          () => false,
        )
        const judged = Entity.judge(Card, {
          after: { id: 'c8', title: 'raw', rank, votes: 0, org: 'acme', createdAt: 1, editedAt: 1 },
        })
        expect({ stored, judged: judged._tag }).toEqual({
          stored: valid,
          judged: valid ? 'Valid' : 'Invalid',
        })
      } finally {
        await close()
      }
    },
  )

const freshSqlite = async (): Promise<Fresh> => {
  const sqlite = new DatabaseSync(':memory:')
  for (const statement of statements(sqliteDb)) sqlite.exec(statement)
  return {
    layer: databaseLayer(drizzle({ client: sqlite })),
    run: async statement => sqlite.exec(statement),
    close: async () => sqlite.close(),
  }
}

describe('the law, on SQLite', () => {
  suite(sqliteDb, freshSqlite)
  checksAgree(freshSqlite)

  it.each([
    ['answered', Ping],
    ['refused', Lost],
  ] as const)(
    'refuses a check that compared nothing, which proves nothing: a write the client did not foresee, %s',
    async (_, mutation) => {
      const { layer, close } = await freshSqlite()
      try {
        await expect(
          checked(sqliteDb, layer, { what: 'nothing', mutation, input: {}, compares: [] }),
        ).rejects.toThrow(`${mutation.name} compared nothing`)
      } finally {
        await close()
      }
    },
  )
})

/** Runs the statements on a Postgres through any Drizzle database. */
const seedPg = async (run: (statement: SQL) => Promise<unknown>) => {
  for (const statement of statements(pgDb)) await run(sql.raw(statement))
}

describe('the law, on Postgres', () => {
  const freshPg = async (): Promise<Fresh> => {
    const pglite = new PGlite()
    const db = drizzlePg({ client: pglite })
    await seedPg(statement => db.execute(statement))
    return {
      layer: databaseLayer(db),
      run: statement => db.execute(sql.raw(statement)),
      close: () => pglite.close(),
    }
  }
  suite(pgDb, freshPg)
  checksAgree(freshPg)
}, 60_000)

/** A Postgres that collates by a locale, when `FOLDKIT_LOCALE_PG` names one (see `conformance.test.ts`). */
const localePg = process.env.FOLDKIT_LOCALE_PG

if (localePg !== undefined)
  describe('the law, on a Postgres that collates by a locale', () => {
    const db = drizzleNodePg(localePg)
    const drop = async () => {
      for (const table of ['law_teams', 'law_users', 'law_cards', 'law_votes', 'law_ledger'])
        await db.execute(sql.raw(`drop table if exists ${table}`))
    }
    afterAll(async () => {
      await drop()
      await db.$client.end()
    })
    const freshLocale = async (): Promise<Fresh> => {
      await drop()
      await seedPg(statement => db.execute(statement))
      return {
        layer: databaseLayer(db),
        run: statement => db.execute(sql.raw(statement)),
        close: async () => undefined,
      }
    }
    suite(pgDb, freshLocale)
    checksAgree(freshLocale)
  })

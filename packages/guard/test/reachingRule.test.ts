// @vitest-environment node
/**
 * A row rule that reads another row, where the check reads one row and runs
 * no statement (#570): a handler's (`GuardServer.mutation`) and a Sync
 * document's are refused where they are made, for every way a rule reaches,
 * never per request. A rule over the row alone is judged as it was.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Query, QueryEvaluateError, Relation } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { bind, databaseLayer, source, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { DocumentId, localSequence, opId, replicaId, sequence, type Operation } from 'foldkit-sync'
import { afterAll, describe, expect, it } from 'vitest'
import { Condition } from '../src/condition.js'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'
import { GuardSync, type CellChange } from '../src/sync.js'

const Fields = {
  Team: Entity.define('Team', Schema.Struct({ id: Schema.String, orgId: Schema.String })),
  Member: Entity.define('Member', Schema.Struct({ id: Schema.String })),
  Seat: Entity.define('Seat', Schema.Struct({ id: Schema.String })),
  Share: Entity.define('Share', Schema.Struct({ id: Schema.String })),
  Note: Entity.define(
    'Note',
    Schema.Struct({ id: Schema.String, orgId: Schema.String, title: Schema.String }),
  ),
}
const Related = Entity.relate(Fields, {
  Member: { team: Relation.one(Fields.Team, { optional: true }) },
  Seat: { team: Relation.one(Fields.Team), member: Relation.one(Fields.Member) },
  Share: { note: Relation.one(Fields.Note), member: Relation.one(Fields.Member) },
  Note: { author: Relation.one(Fields.Member), team: Relation.one(Fields.Team) },
})
const viewer = Expr.viewer(Related.Member)
const G = Guards.declare(
  'Notes',
  Schema.Struct({ id: Schema.String }),
  guard => ({
    isAdmin: guard.principal(),
    isAuthor: guard.row(Related.Note, () => Expr.eq(Related.Note.relations.author, viewer)),
    byPath: guard.row(Related.Note, () =>
      Expr.eq(Expr.path(Related.Note.relations.team, Related.Team.fields.orgId), 'acme'),
    ),
    byViewerPath: guard.row(Related.Note, () =>
      Expr.eq(
        Related.Note.fields.orgId,
        Expr.path(viewer, Expr.path(Related.Member.relations.team, Related.Team.fields.orgId)),
      ),
    ),
    byExists: guard.row(Related.Note, () =>
      Expr.exists(Related.Share.relations.note, Expr.eq(Related.Share.relations.member, viewer)),
    ),
    byPathExists: guard.row(Related.Note, () =>
      Expr.path(
        Related.Note.relations.team,
        Expr.exists(Related.Seat.relations.team, Expr.eq(Related.Seat.relations.member, viewer)),
      ),
    ),
  }),
  { key: user => user.id, unguarded: 'allow', viewer: Related.Member },
)
const Policy = G.implement({ isAdmin: () => false })

const reaching = [
  { name: 'byPath', guard: G.byPath, reaches: ['Path'] },
  { name: 'byViewerPath', guard: G.byViewerPath, reaches: ['ViewerPath'] },
  { name: 'byExists', guard: G.byExists, reaches: ['Exists'] },
  { name: 'byPathExists', guard: G.byPathExists, reaches: ['Exists'] },
] as const

// Its author changes and removes it: a rule over the row alone.
const Own = Related.Note.pipe(
  Guards.attach(G, { row: { Update: [G.isAuthor], Delete: [G.isAuthor] } }),
)

const Touch = Mutation.make('TouchNote', { Input: { id: Schema.String }, Output: {} })
const Remove = Mutation.make('RemoveNote', { Input: { id: Schema.String }, Output: {} })

const teams = sqliteTable('teams', { id: text('id').primaryKey(), orgId: text('org_id').notNull() })
const members = sqliteTable('members', { id: text('id').primaryKey(), teamId: text('team_id') })
const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  title: text('title').notNull(),
  authorId: text('author_id').notNull(),
  teamId: text('team_id').notNull(),
})
const Db = bind(
  { Team: Related.Team, Member: Related.Member, Note: Own },
  {
    Team: { table: teams },
    Member: { table: members, relations: { team: { field: members.teamId } } },
    Note: {
      table: notes,
      visible: GuardDrizzle.visible(Policy, [Own]).Note,
      relations: { author: { field: notes.authorId }, team: { field: notes.teamId } },
    },
  },
)
const ownSource = source(Db.Note)

const as = (id: string) => Option.some({ id })
const ran = () => Effect.succeed({ output: {} })

describe('the fixtures', () => {
  it.each(reaching)(
    '$name reaches as $reaches, and one row cannot judge it',
    ({ guard, reaches }) => {
      expect(Query.dependencies(guard.query).reaches.map(reach => reach._tag)).toEqual(reaches)
      const Ruled = Related.Note.pipe(Guards.attach(G, { row: { Update: [guard] } }))
      const { condition } = Effect.runSync(Policy.writable(Ruled, as('ada'), 'Update'))
      // Why such a rule is refused where the check is made: judged per request, it throws.
      expect(() =>
        Condition.holds(
          condition,
          { id: 'n1', orgId: 'acme', title: 'Plans', author: 'Member:ada', team: 'Team:t1' },
          Policy.inputOf(as('ada')),
          () => false,
          Policy.operators,
        ),
      ).toThrow(QueryEvaluateError)
    },
  )

  it('byPathExists reaches its exists through a relation of the row', () => {
    expect(
      Query.dependencies(G.byPathExists.query).reaches.map(reach => reach.via.map(via => via.key)),
    ).toEqual([['team']])
    expect(Query.dependencies(G.byExists.query).reaches.map(reach => reach.via.length)).toEqual([0])
  })
})

describe('GuardServer.mutation over a rule that reads another row', () => {
  const handler = (entity: typeof Own, interaction: 'Update' | 'Delete') =>
    GuardServer.mutation(
      Touch,
      { entity, policy: Policy, interaction, id: input => input.id, source: ownSource },
      ran,
    )

  it.each(
    reaching.flatMap(variant =>
      (['Update', 'Delete'] as const).map(interaction => ({ ...variant, interaction })),
    ),
  )(
    'refuses $interaction ruled $name where the handler is made',
    ({ name, guard, interaction }) => {
      const Ruled = Related.Note.pipe(Guards.attach(G, { row: { [interaction]: [guard] } }))
      expect(() => handler(Ruled, interaction)).toThrow(
        `[foldkit-guard] GuardServer.mutation: TouchNote is checked against Note's ${interaction} rule, whose ${name} reads another row (a path or an exists), which a handler's check over the one row it reads cannot judge; declare the write (Mutation.write) and land it through GuardServer.writer over a writer that judges rules in its statement (foldkit-remote-drizzle's writer), or check ${interaction} by a rule over the row alone`,
      )
    },
  )

  it('refuses one beside a rule over the row, and one inside all', () => {
    const Beside = Related.Note.pipe(
      Guards.attach(G, { row: { Update: [G.isAuthor, G.byPath, G.byExists] } }),
    )
    expect(() => handler(Beside, 'Update')).toThrow('whose byPath, byExists reads another row')
    const Within = Related.Note.pipe(
      Guards.attach(G, { row: { Update: [Guards.all(G.isAdmin, G.byViewerPath)] } }),
    )
    expect(() => handler(Within, 'Update')).toThrow('whose byViewerPath reads another row')
  })

  it('reads the rules of the interaction it checks, not another’s', () => {
    const DeleteReaches = Related.Note.pipe(
      Guards.attach(G, { row: { Update: [G.isAuthor], Delete: [G.byPath] } }),
    )
    const UpdateReaches = Related.Note.pipe(
      Guards.attach(G, { row: { Update: [G.byPath], Delete: [G.isAuthor] } }),
    )
    const unbound = "TouchNote's Source does not apply Note's Read rules"
    // Past the check, each meets the next one: the Source was bound for another descriptor.
    expect(() => handler(DeleteReaches, 'Update')).toThrow(unbound)
    expect(() => handler(UpdateReaches, 'Delete')).toThrow(unbound)
    expect(() => handler(DeleteReaches, 'Delete')).toThrow('whose byPath reads another row')
    expect(() => handler(UpdateReaches, 'Update')).toThrow('whose byPath reads another row')
  })
})

describe('GuardServer.mutation over a rule that reads the row alone', () => {
  const client = new DatabaseSync(':memory:')
  for (const statement of [
    'create table teams (id text primary key, org_id text not null)',
    'create table members (id text primary key, team_id text)',
    'create table notes (id text primary key, org_id text not null, title text not null, author_id text not null, team_id text not null)',
    "insert into teams values ('t1', 'acme')",
    "insert into members values ('ada', 't1'), ('bo', null)",
    "insert into notes values ('n1', 'acme', 'Plans', 'ada', 't1'), ('n2', 'acme', 'Notes', 'bo', 't1')",
  ])
    client.exec(statement)
  afterAll(() => client.close())
  const seen: Array<string> = []
  const guarded = (mutation: typeof Touch | typeof Remove, interaction: 'Update' | 'Delete') =>
    GuardServer.mutation(
      mutation,
      { entity: Own, policy: Policy, interaction, id: input => input.id, source: ownSource },
      ({ input }) => Effect.sync(() => (seen.push(`${mutation.name} ${input.id}`), { output: {} })),
    )
  const server = RemoteServer.make<Option.Option<{ readonly id: string }>, DrizzleDatabase>({
    entities: [],
    mutations: [guarded(Touch, 'Update'), guarded(Remove, 'Delete')],
    viewer: Policy.viewer,
  })
  const outcome = (who: string, mutation: string, id: string) =>
    Effect.runPromise(
      RemoteServer.handlers(server, as(who))
        .FoldkitRemoteMutate({ requestId: 'r', mutation, input: { id } })
        .pipe(
          Effect.match({ onSuccess: () => 'ran', onFailure: error => error._tag }),
          Effect.provide(databaseLayer(drizzle({ client }))),
        ),
    )

  it.each(['TouchNote', 'RemoveNote'])(
    '%s runs for its author, and is refused another',
    async name => {
      seen.length = 0
      expect(await outcome('ada', name, 'n1')).toBe('ran')
      expect(await outcome('ada', name, 'n2')).toBe('Forbidden')
      expect(seen).toEqual([`${name} n1`])
    },
  )

  describe('a Sync document', () => {
    const operation: Operation = {
      protocolVersion: 1,
      schemaVersion: 1,
      documentId: DocumentId.make('notes'),
      replicaId: replicaId('tab'),
      localSequence: localSequence(1),
      opId: opId('tab:1'),
      baseCursor: sequence(0),
      message: null,
    }
    // No reader fixes whose document it is, as one with readers does.
    const Edits = GuardSync.document<{ readonly id: string }>(
      { entity: Own, members: ['title'] },
      { readers: [] },
    )
    const admit = (who: string, changes: ReadonlyArray<CellChange>) =>
      Effect.runPromise(
        GuardSync.admit(Policy, Edits, {
          principal: as(who),
          source: ownSource,
          changesOf: () => changes,
        })(operation).pipe(Effect.provide(databaseLayer(drizzle({ client })))),
      )

    it('admits an edit by the row’s author, and refuses another’s', async () => {
      expect(await admit('ada', [{ id: 'n1', member: 'title', value: 'Plans, kept' }])).toBe(true)
      expect(await admit('ada', [{ id: 'n2', member: 'title', value: 'Mine' }])).toBe(false)
    })
  })
})

describe('GuardSync.document over a rule that reads another row', () => {
  it.each(reaching)('refuses an Update ruled $name where it is declared', ({ name, guard }) => {
    const Ruled = Related.Note.pipe(Guards.attach(G, { row: { Update: [guard] } }))
    expect(() =>
      GuardSync.document({ entity: Ruled, members: ['title'] }, { readers: [] }),
    ).toThrow(
      `[foldkit-guard] GuardSync.document of Note: its Update rule's ${name} reads another row (a path or an exists), which an edit admitted over the one row read cannot judge; write those members through a declared write and GuardServer.writer over a writer that judges rules in its statement, or rule Update over the row alone`,
    )
  })

  it('reads the Update rule an edit is admitted by, not the Delete rule', () => {
    const DeleteReaches = Related.Note.pipe(
      Guards.attach(G, { row: { Update: [G.isAuthor], Delete: [G.byPath] } }),
    )
    expect(
      GuardSync.document({ entity: DeleteReaches, members: ['title'] }, { readers: [] }).entity,
    ).toBe(DeleteReaches)
  })
})

// @vitest-environment node
/**
 * The three things `may` says of an interaction (#571): yes, no, or nothing,
 * where the rule reads another row and one row cannot decide it. Every reader
 * agrees on each: a hint (a lock, an offered capability, a write refused where
 * it is made) acts only on a no, `can` only on a yes, and the server decides
 * what was left unsaid when the write reaches it.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Result, Schema } from 'effect'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import {
  Mutation,
  REMOTE_PROTOCOL_VERSION,
  forbiddenByWrite,
  type EntityStore,
  type RemoteData,
} from 'foldkit-remote'
import { bind, databaseLayer, source, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { Verdict } from '@doeixd/metakit'
import { afterAll, describe, expect, it } from 'vitest'
import { GuardAgent } from '../src/agent.js'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards, Interaction, May, MaySchema, type MayAnswer } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const Fields = {
  Team: Entity.define('Team', Schema.Struct({ id: Schema.String, orgId: Schema.String })),
  Member: Entity.define('Member', Schema.Struct({ id: Schema.String })),
  Note: Entity.define(
    'Note',
    Schema.Struct({ id: Schema.String, orgId: Schema.String, title: Schema.String }),
  ),
}
const Related = Entity.relate(Fields, {
  Member: { team: Relation.one(Fields.Team, { optional: true }) },
  Note: { author: Relation.one(Fields.Member) },
})
const G = Guards.declare(
  'Notes',
  Schema.Struct({ id: Schema.String }),
  guard => ({
    isAuthor: guard.row(Related.Note, () =>
      Expr.eq(Related.Note.relations.author, Expr.viewer(Related.Member)),
    ),
    inOrg: guard.row(Related.Note, () =>
      Expr.eq(
        Related.Note.fields.orgId,
        Expr.path(
          Expr.viewer(Related.Member),
          Expr.path(Related.Member.relations.team, Related.Team.fields.orgId),
        ),
      ),
    ),
  }),
  { key: user => user.id, unguarded: 'allow', viewer: Related.Member },
)
// Anyone reads a note; its organisation, as the reader's team says now, changes it; its author removes it.
const Note = Related.Note.pipe(
  Guards.attach(G, {
    row: {
      Update: Guards.on([G.inOrg], Guards.explain('Only its organisation may change it.')),
      Delete: [G.isAuthor],
    },
  }),
  Guards.may,
)
const Policy = G.implement({})

const said = (row: MayAnswer['row'], more: Partial<MayAnswer> = {}): MayAnswer => ({
  row,
  reasons: {},
  members: {},
  relations: {},
  ...more,
})

// Each state of the row's Update, beside each state of the member's or relation's own rule.
const states = [
  { update: 'yes', row: { Update: true } },
  { update: 'no', row: { Update: false } },
  { update: 'unsaid', row: {} },
] as const

const Retitle = Write.update(
  Entity.input(Note, Schema.Struct({ id: Schema.String, title: Schema.String })),
  { id: 'id' },
)
const Hand = Write.update(
  Entity.input(Note, Schema.Struct({ id: Schema.String, authorId: Schema.String }), {
    authorId: Relation.input(Note.relations.author),
  }),
  { id: 'id' },
)
const Drop = Write.delete(Entity.input(Note, Schema.Struct({ id: Schema.String })), { id: 'id' })

/** The store holding n1 with `may`. */
const holding = (may: MayAnswer): EntityStore => ({
  'Note:n1': {
    values: { id: 'n1', title: 'Plans', may },
    present: new Set(['id', 'title', 'may']),
    stale: new Set(),
    unavailable: new Set(),
    tombstone: false,
    updatedAt: 0,
    oldestAt: 0,
    windows: {},
  },
})
const forbidden = (write: Parameters<typeof forbiddenByWrite>[0], input: unknown, may: MayAnswer) =>
  Option.isSome(forbiddenByWrite(write, input, undefined, holding(may)))

const ready = (may: MayAnswer): RemoteData<{ readonly may: MayAnswer }> => ({
  _tag: 'Ready',
  value: { may },
})
const agent = (interaction: 'Update' | 'Delete', may: MayAnswer) => ({
  authorize: GuardAgent.authorize(interaction, () => ready(may))({ input: {}, model: {} }),
  available: GuardAgent.available(interaction, () => ready(may))({}),
})

describe('what may says of a row interaction', () => {
  it.each([
    { state: 'yes', row: { Delete: true }, answer: 'True', can: true, refused: false },
    { state: 'no', row: { Delete: false }, answer: 'False', can: false, refused: true },
    { state: 'unsaid', row: {}, answer: 'Unknown', can: false, refused: false },
  ])('$state: every reader agrees', ({ row, answer, can, refused }) => {
    const may = said(row)
    expect(May.answer(may, 'Delete')._tag).toBe(answer)
    expect(May.can(may, 'Delete')).toBe(can)
    expect(May.refused(may, 'Delete')).toBe(refused)
    // A hint acts on a no, and only on a no.
    expect(forbidden(Drop, { id: 'n1' }, may)).toBe(refused)
    expect(agent('Delete', may)).toEqual({ authorize: !refused, available: !refused })
  })

  it('reads an interaction by own key, never off Object’s prototype', () => {
    // `constructor` is on every object: an answer that does not name it says nothing of it.
    const inherited = Interaction.make('constructor').key
    const may = said({ Update: true })
    expect(Verdict.isUnknown(May.answer(may, inherited))).toBe(true)
    expect(May.refused(may, inherited)).toBe(false)
    expect(May.can(may, inherited)).toBe(false)
  })

  it('gives the agent the reason a refusal was explained with', () => {
    const may = said(
      { Update: false },
      { reasons: { Update: 'Only its organisation may change it.' } },
    )
    expect(agent('Update', may)).toEqual({
      authorize: { allowed: false, reason: 'Only its organisation may change it.' },
      available: false,
    })
  })
})

describe('setting a member, by the row’s Update and the member’s own rule', () => {
  const members = [
    { own: 'none', members: {} },
    { own: 'yes', members: { title: true } },
    { own: 'no', members: { title: false } },
  ] as const
  // Locked and refused where either says no; `canSet` only where the row said yes and the member did not say no.
  const expected: Record<string, { canSet: boolean; locked: boolean }> = {
    'yes/none': { canSet: true, locked: false },
    'yes/yes': { canSet: true, locked: false },
    'yes/no': { canSet: false, locked: true },
    'no/none': { canSet: false, locked: true },
    'no/yes': { canSet: false, locked: true },
    'no/no': { canSet: false, locked: true },
    'unsaid/none': { canSet: false, locked: false },
    'unsaid/yes': { canSet: false, locked: false },
    'unsaid/no': { canSet: false, locked: true },
  }
  it.each(
    states.flatMap(state =>
      members.map(member => ({
        ...state,
        ...member,
        ...expected[`${state.update}/${member.own}`]!,
      })),
    ),
  )('Update $update, its own rule $own', ({ row, members, canSet, locked }) => {
    const may = said(row, { members })
    expect(May.canSet(may, Note, 'title')).toBe(canSet)
    expect(May.locks(Note).locked({ may }, 'title')).toBe(locked)
    expect(forbidden(Retitle, { id: 'n1', title: 'Kept' }, may)).toBe(locked)
    // Never both: what is locked may not be set, and what may be set is not locked.
    expect(canSet && locked).toBe(false)
  })
})

describe('pointing a relation, by the row’s Update and the relation’s own rules', () => {
  const relations = [
    { own: 'none', relations: {}, link: true, unlink: true },
    { own: 'both', relations: { author: { Link: true, Unlink: true } }, link: true, unlink: true },
    {
      own: 'no link',
      relations: { author: { Link: false, Unlink: true } },
      link: false,
      unlink: true,
    },
    {
      own: 'no unlink',
      relations: { author: { Link: true, Unlink: false } },
      link: true,
      unlink: false,
    },
  ] as const
  it.each(states.flatMap(state => relations.map(relation => ({ ...state, ...relation }))))(
    'Update $update, its own rules: $own',
    ({ update, row, relations, link, unlink }) => {
      const may = said(row, { relations })
      // An editor's key is locked unless it may be both unlinked and linked, where nothing said no.
      expect(May.locks(Note).locked({ may }, 'author')).toBe(update === 'no' || !link || !unlink)
      // This write links a row not known to be linked: the Link rule alone can refuse it.
      expect(forbidden(Hand, { id: 'n1', authorId: 'bo' }, may)).toBe(update === 'no' || !link)
      expect(May.canLink(may, Note, 'author', 'Link')).toBe(update === 'yes' && link)
      expect(May.canLink(may, Note, 'author', 'Unlink')).toBe(update === 'yes' && unlink)
    },
  )
})

describe('a rule over a path from the viewer, from the page to the server and back', () => {
  const teams = sqliteTable('teams', {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
  })
  const members = sqliteTable('members', { id: text('id').primaryKey(), teamId: text('team_id') })
  const notes = sqliteTable('notes', {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    title: text('title').notNull(),
    authorId: text('author_id').notNull(),
  })
  const Db = bind(
    { Team: Related.Team, Member: Related.Member, Note },
    {
      Team: { table: teams },
      Member: { table: members, relations: { team: { field: members.teamId } } },
      Note: {
        table: notes,
        visible: GuardDrizzle.visible(Policy, [Note]).Note,
        relations: { author: { field: notes.authorId } },
        derived: { may: { supplied: true } },
      },
    },
  )
  const RetitleNote = Mutation.write('RetitleNote', Retitle)
  const server = RemoteServer.make<Option.Option<{ readonly id: string }>, DrizzleDatabase>({
    entities: [source(Db.Note, { filter: GuardServer.filter(Note, Policy) })],
    mutations: [RemoteServer.write(RetitleNote, GuardServer.writer(Note, Policy, writer(Db.Note)))],
    viewer: Policy.viewer,
  })
  const client = new DatabaseSync(':memory:')
  for (const statement of [
    'create table teams (id text primary key, org_id text not null)',
    'create table members (id text primary key, team_id text)',
    'create table notes (id text primary key, org_id text not null, title text not null, author_id text not null)',
    "insert into teams values ('t1', 'acme')",
    "insert into members values ('ada', 't1'), ('bo', null)",
    "insert into notes values ('n1', 'acme', 'Plans', 'bo')",
  ])
    client.exec(statement)
  afterAll(() => client.close())
  const layer = databaseLayer(drizzle({ client }))
  const as = (id: string) => Option.some({ id })
  const decodeMay = Schema.decodeUnknownSync(MaySchema)
  const mayOf = async (who: string) => {
    const read = await Effect.runPromise(
      RemoteServer.handlers(server, as(who))
        .FoldkitRemoteRead({
          version: REMOTE_PROTOCOL_VERSION,
          requests: [{ entity: 'Note', id: 'n1', fields: ['may'] }],
        })
        .pipe(Effect.provide(layer)),
    )
    return decodeMay(read.entities[0]?.values.may)
  }
  const retitle = (who: string, title: string) =>
    Effect.runPromise(
      Effect.result(
        RemoteServer.handlers(server, as(who)).FoldkitRemoteMutate({
          requestId: 'r',
          mutation: 'RetitleNote',
          input: { id: 'n1', title },
        }),
      ).pipe(Effect.provide(layer)),
    )

  // ada is of the note's organisation and did not write it; bo wrote it and is on no team.
  it.each(['ada', 'bo'])(
    'the server says nothing of Update to %s, and yes or no of Delete',
    async who => {
      const may = await mayOf(who)
      expect(Verdict.isUnknown(May.answer(may, 'Update'))).toBe(true)
      expect(Verdict.isTrue(May.answer(may, 'Delete'))).toBe(who === 'bo')
      expect(Verdict.isFalse(May.answer(may, 'Delete'))).toBe(who !== 'bo')
    },
  )

  it.each(['ada', 'bo'])('the page does not lock %s’s editor, and sends the write', async who => {
    const may = await mayOf(who)
    expect(May.locks(Note).locked({ may }, 'title')).toBe(false)
    expect(forbidden(Retitle, { id: 'n1', title: 'Kept' }, may)).toBe(false)
    expect(agent('Update', may)).toEqual({ authorize: true, available: true })
    // Not a yes either: nothing drawn only for a certain yes is drawn.
    expect(May.can(may, 'Update')).toBe(false)
  })

  it('the server lets the member, and refuses the other with the words the page shows', async () => {
    expect(Result.isSuccess(await retitle('ada', 'Plans, kept'))).toBe(true)
    expect(client.prepare("select title from notes where id = 'n1'").get()).toEqual({
      title: 'Plans, kept',
    })
    expect(await retitle('bo', 'Mine')).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden', reason: 'Only its organisation may change it.' },
    })
    expect(client.prepare("select title from notes where id = 'n1'").get()).toEqual({
      title: 'Plans, kept',
    })
  })
})

/**
 * `reaches(write, query)`: which lists a declared write can change, from
 * declarations alone (#439 R1). Each query reads a member in exactly one way
 * (an own field, a path's field or link, an exists' relation, `where` or link,
 * a path from the viewer), and each write writes exactly one member, so a
 * reach variant dropped from `reaches` turns one row of the table.
 */
import { Schema } from 'effect'
import {
  Entity,
  Expr,
  Footprint,
  type EntityIdentity,
  Order,
  Relation,
  Write,
} from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Mutation, Query } from '../src/index.js'
import { Reach, reaches } from '../src/reaches.js'

const TeamFields = Entity.define('Team', Schema.Struct({ id: Schema.String, name: Schema.String }))
const MemberFields = Entity.define(
  'Member',
  Schema.Struct({ id: Schema.String, handle: Schema.String }),
)
const NoteFields = Entity.define('Note', Schema.Struct({ id: Schema.String, body: Schema.String }))
const Shop = Entity.relate(
  { Team: TeamFields, Member: MemberFields, Note: NoteFields },
  { Member: { team: Relation.one(TeamFields) }, Note: { team: Relation.one(TeamFields) } },
)
const { Team, Member, Note } = Shop

const byId = (entity: { readonly fields: { readonly id: any } }) => Order.asc(entity.fields.id)

const Own = Query.define('Own', {}, () =>
  Query.from(Note).pipe(Query.where(Expr.eq(Note.fields.body, 'x')), Query.orderBy(byId(Note))),
)
const ThroughPath = Query.define('ThroughPath', {}, () =>
  Query.from(Member).pipe(
    Query.where(Expr.eq(Expr.path(Member.relations.team, Team.fields.name), 'x')),
    Query.orderBy(byId(Member)),
  ),
)
const ExistsRelation = Query.define('ExistsRelation', {}, () =>
  Query.from(Team).pipe(Query.where(Expr.exists(Member.relations.team)), Query.orderBy(byId(Team))),
)
const ExistsWhere = Query.define('ExistsWhere', {}, () =>
  Query.from(Team).pipe(
    Query.where(Expr.exists(Member.relations.team, Expr.eq(Member.fields.handle, 'ada'))),
    Query.orderBy(byId(Team)),
  ),
)
const ExistsVia = Query.define('ExistsVia', {}, () =>
  Query.from(Note).pipe(
    Query.where(Expr.path(Note.relations.team, Expr.exists(Member.relations.team))),
    Query.orderBy(byId(Note)),
  ),
)
const ViewerField = Query.define('ViewerField', {}, () =>
  Query.from(Note).pipe(
    Query.where(Expr.eq(Note.fields.body, Expr.path(Expr.viewer(Member), Member.fields.handle))),
    Query.orderBy(byId(Note)),
  ),
)
const ViewerVia = Query.define('ViewerVia', {}, () =>
  Query.from(Note).pipe(
    Query.where(
      Expr.eq(
        Note.fields.body,
        Expr.path(Expr.viewer(Member), Expr.path(Member.relations.team, Team.fields.name)),
      ),
    ),
    Query.orderBy(byId(Note)),
  ),
)

const SetBody = Write.update(
  Entity.input(Note, Schema.Struct({ id: Schema.String, body: Schema.String })),
  { id: 'id' },
)
const SetHandle = Write.update(
  Entity.input(Member, Schema.Struct({ id: Schema.String, handle: Schema.String })),
  { id: 'id' },
)
const SetTeamName = Write.update(
  Entity.input(Team, Schema.Struct({ id: Schema.String, name: Schema.String })),
  { id: 'id' },
)
const RelinkMember = Write.update(
  Entity.input(Member, Schema.Struct({ id: Schema.String, teamId: Schema.String }), {
    teamId: Relation.input(Member.relations.team),
  }),
  { id: 'id' },
)
const RelinkNote = Write.update(
  Entity.input(Note, Schema.Struct({ id: Schema.String, teamId: Schema.String }), {
    teamId: Relation.input(Note.relations.team),
  }),
  { id: 'id' },
)

const writes = { SetBody, SetHandle, SetTeamName, RelinkMember, RelinkNote }
const queries = {
  Own,
  ThroughPath,
  ExistsRelation,
  ExistsWhere,
  ExistsVia,
  ViewerField,
  ViewerVia,
}

/** The writes that reach each query: every other write is unaffected. */
const reached: Record<keyof typeof queries, ReadonlyArray<keyof typeof writes>> = {
  // An own field.
  Own: ['SetBody'],
  // A path's field, and the link the path starts from.
  ThroughPath: ['SetTeamName', 'RelinkMember'],
  // An exists' relation: the rows pointing here.
  ExistsRelation: ['RelinkMember'],
  // An exists' `where` (the handle), and its relation (the link).
  ExistsWhere: ['SetHandle', 'RelinkMember'],
  // The link an exists is reached by, and the exists' own relation.
  ExistsVia: ['RelinkNote', 'RelinkMember'],
  // A path from the viewer: its field.
  ViewerField: ['SetBody', 'SetHandle'],
  // A path from the viewer: its field and the link it passes.
  ViewerVia: ['SetBody', 'SetTeamName', 'RelinkMember'],
}

describe('reaches: a declared write against a query body', () => {
  for (const [query, descriptor] of Object.entries(queries)) {
    for (const [write, declared] of Object.entries(writes)) {
      const expected = reached[query as keyof typeof queries].includes(write as keyof typeof writes)
        ? Reach.Reads()
        : Reach.Unaffected()
      it(`${write} against ${query}`, () => {
        expect(reaches(declared, descriptor)).toEqual(expected)
      })
    }
  }

  it('takes a mutation declared with Mutation.write as its write', () => {
    expect(reaches(Mutation.write('SetTeamName', SetTeamName), ThroughPath)).toEqual(Reach.Reads())
    expect(reaches(Mutation.write('SetTeamName', SetTeamName), Own)).toEqual(Reach.Unaffected())
  })

  it('tells two Entities of one name apart by identity', () => {
    const Namesake = Entity.define(
      'Note',
      Schema.Struct({ id: Schema.String, body: Schema.String }),
    )
    expect(
      reaches(
        Write.update(
          Entity.input(Namesake, Schema.Struct({ id: Schema.String, body: Schema.String })),
          { id: 'id' },
        ),
        Own,
      ),
    ).toEqual(Reach.Unaffected())
  })

  it('is unknown, never unaffected, for a query with no body', () => {
    const Opaque = Query.make('Opaque', { Input: {}, Result: Note })
    expect(reaches(SetBody, Opaque)).toEqual(Reach.Unknown({ why: 'NoBody' }))
  })

  it('is unknown for a mutation whose writes only its handler knows', () => {
    const Handled = Mutation.make('Handled', { Input: { id: Schema.String }, Output: {} })
    expect(reaches(Handled, Own)).toEqual(Reach.Unknown({ why: 'Handler' }))
  })

  it('names the handler when the query has no body either', () => {
    const Opaque = Query.make('Opaque', { Input: {}, Result: Note })
    const Handled = Mutation.make('Handled', { Input: { id: Schema.String }, Output: {} })
    expect(reaches(Handled, Opaque)).toEqual(Reach.Unknown({ why: 'Handler' }))
  })
})

describe('reaches: a mutation that is no Write, by its footprint', () => {
  const opaque = (
    footprint: Footprint,
    entity: { readonly identity: EntityIdentity<string> } = Note,
  ) => ({
    ...Mutation.make('Opaque', { Input: { id: Schema.String }, Output: {} }),
    footprint: { entity: entity.identity, footprint },
  })

  it('reads a declared footprint as a write of those fields', () => {
    const declared = Footprint.declared({
      reads: [Note.fields.id],
      writes: [Note.fields.body],
      by: 'test',
    })
    expect(reaches(opaque(declared), Own)).toEqual(Reach.Reads())
    expect(reaches(opaque(declared), ThroughPath)).toEqual(Reach.Unaffected())
  })

  it('reads what a footprint only reads as no write', () => {
    const readsOnly = Footprint.declared({
      reads: [Team.fields.name],
      writes: [Team.fields.id],
      by: 'test',
    })
    expect(reaches(opaque(readsOnly, Team), ThroughPath)).toEqual(Reach.Unaffected())
  })

  it('keeps an Unknown footprint unknown, never unaffected', () => {
    expect(reaches(opaque(Footprint.unknown), Own)).toEqual(Reach.Unknown({ why: 'Handler' }))
  })

  it('tells a namesake Entity apart by identity', () => {
    const Namesake = Entity.define(
      'Note',
      Schema.Struct({ id: Schema.String, body: Schema.String }),
    )
    const declared = Footprint.declared({ writes: [Namesake.fields.body], by: 'test' })
    expect(reaches(opaque(declared, Namesake), Own)).toEqual(Reach.Unaffected())
  })
})

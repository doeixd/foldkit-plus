/**
 * A member set from a path through the viewer, predicted from what the store
 * holds: the asker's row and the rows reached from it. Where the store lacks
 * one, nothing is predicted for the member, and the answer brings it.
 * operations-phase3-DESIGN.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mutation, Remote } from '../src/index.js'

const Fields = {
  Team: Entity.define('Team', Schema.Struct({ id: Schema.String, orgId: Schema.String })),
  Member: Entity.define('Member', Schema.Struct({ id: Schema.String })),
  Note: Entity.define(
    'Note',
    // Null where the writer has no team: so null and "not held" read apart.
    Schema.Struct({ id: Schema.String, body: Schema.String, orgId: Schema.NullOr(Schema.String) }),
  ),
}
const {
  Team,
  Member,
  Note: Unset,
} = Entity.relate(Fields, {
  Member: { team: Relation.one(Fields.Team, { optional: true }) },
})
const Note = Unset.pipe(
  Entity.sets(
    { orgId: Expr.path(Expr.viewer(Member), Expr.path(Member.relations.team, Team.fields.orgId)) },
    { on: 'create' },
  ),
)
const AddNote = Mutation.write(
  'AddNote',
  Write.insert(Entity.input(Note, Schema.Struct({ id: Schema.String, body: Schema.String })), {
    id: 'id',
  }),
)

const Model = Schema.Struct({ remote: Remote.Model, me: Schema.String })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Team, Member, Note],
  mutations: [AddNote],
  viewer: model => Option.some(Remote.ref(Member, model.me)),
})
const Org = Entity.select(Note, { orgId: true })
const Body = Entity.select(Note, { body: true })

/** Ada's page, holding her row and, unless told otherwise, her team's. */
const holding = (rows: ReadonlyArray<{ entity: string; id: string; values: object }>): Model =>
  Data.reduce(
    { remote: Remote.initial, me: 'ada' },
    {
      _tag: 'ReadReceived',
      requests: rows.map(({ entity, id, values }) => ({
        entity,
        id,
        fields: Object.keys(values),
      })),
      result: { settled: [], entities: rows.map(row => ({ ...row, values: { ...row.values } })) },
      now: 0,
    },
  )
const ada = { entity: 'Member', id: 'ada', values: { id: 'ada', team: 'Team:t1' } }
const team = { entity: 'Team', id: 't1', values: { id: 't1', orgId: 'acme' } }

describe('a member set from a path through the viewer, predicted', () => {
  it('is what the store holds of the row the path reaches', () => {
    const { model } = Data.mutate(holding([ada, team]), AddNote, { id: 'n1', body: 'Hi' })
    expect(Data.get(Org, 'n1').read(model)).toMatchObject({ value: { orgId: 'acme' } })
  })

  it('is not predicted where the store lacks a row the path reaches, or its field', () => {
    const { model } = Data.mutate(holding([ada]), AddNote, { id: 'n1', body: 'Hi' })
    expect(Data.get(Body, 'n1').read(model)).toMatchObject({ value: { body: 'Hi' } })
    expect(Data.get(Org, 'n1').read(model)._tag).not.toBe('Ready')
    const bare = { ...team, values: { id: 't1' } }
    const unread = Data.mutate(holding([ada, bare]), AddNote, { id: 'n1', body: 'Hi' }).model
    expect(Data.get(Org, 'n1').read(unread)._tag).not.toBe('Ready')
  })

  it('is null where the viewer has no team', () => {
    const alone = { ...ada, values: { id: 'ada', team: null } }
    const { model } = Data.mutate(holding([alone]), AddNote, { id: 'n1', body: 'Hi' })
    expect(Data.get(Org, 'n1').read(model)).toMatchObject({ value: { orgId: null } })
  })
})

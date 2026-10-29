/**
 * A body over other rows (a path, a path from the viewer) judged by the
 * client over the store, three-valued: a row the store can follow is judged,
 * one whose path reaches a row it lacks is skipped, and what is admitted
 * comes in the body's order. operations-phase6-DESIGN §3.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Order, Relation } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, matching, type NormalizedPatch } from '../src/index.js'

const TeamFields = Entity.define('Team', Schema.Struct({ id: Schema.String, name: Schema.String }))
const MemberFields = Entity.define(
  'Member',
  Schema.Struct({ id: Schema.String, handle: Schema.String }),
)
const Org = Entity.relate(
  { Team: TeamFields, Member: MemberFields },
  { Member: { team: Relation.one(TeamFields) } },
)
const { Team, Member } = Org

const OfTeam = Query.define('OfTeam', { name: Schema.String }, ({ input }) =>
  Query.from(Member).pipe(
    Query.where(Expr.eq(Expr.path(Member.relations.team, Team.fields.name), input.name)),
    Query.orderBy(Order.desc(Member.fields.handle)),
  ),
)
/** Members of the viewer's own team. */
const Teammates = Query.define('Teammates', {}, () =>
  Query.from(Member).pipe(
    Query.where(
      Expr.eq(
        Expr.path(Member.relations.team, Team.fields.name),
        Expr.path(Expr.viewer(Member), Expr.path(Member.relations.team, Team.fields.name)),
      ),
    ),
    Query.orderBy(Order.asc(Member.fields.handle)),
  ),
)

const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Team, Member],
  queries: [OfTeam, Teammates],
})

const rows: ReadonlyArray<NormalizedPatch> = [
  { entity: 'Team', id: 't1', values: { id: 't1', name: 'red' } },
  { entity: 'Team', id: 't2', values: { id: 't2', name: 'blue' } },
  { entity: 'Member', id: 'm1', values: { id: 'm1', handle: 'ada', team: 'Team:t1' } },
  { entity: 'Member', id: 'm2', values: { id: 'm2', handle: 'bo', team: 'Team:t1' } },
  { entity: 'Member', id: 'm3', values: { id: 'm3', handle: 'cy', team: 'Team:t2' } },
  // Its team is not held, so where its path leads is unknown.
  { entity: 'Member', id: 'm4', values: { id: 'm4', handle: 'di', team: 'Team:t9' } },
]
const store = Data.storeOf(
  Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ReadReceived',
      requests: rows.map(row => ({
        entity: row.entity,
        id: row.id,
        fields: Object.keys(row.values),
      })),
      result: { settled: [], entities: [...rows] },
      now: 0,
    },
  ),
)

describe('a body over a path, judged over the store', () => {
  it('admits the rows whose path it can follow, in the body’s order, and skips the rest', () => {
    expect(matching(store, OfTeam, { name: 'red' })).toEqual({
      matched: ['Member:m2', 'Member:m1'],
      skipped: ['Member:m4'],
    })
  })

  it('judges a path from the viewer by the viewer’s row', () => {
    const viewer = (id: string) => ({
      context: { viewer: Option.some({ entity: 'Member', id }), now: Option.none() },
    })
    expect(matching(store, Teammates, {}, viewer('m3'))).toEqual({
      matched: ['Member:m3'],
      skipped: ['Member:m4'],
    })
    // The viewer's own team is not held: nothing can be told.
    expect(matching(store, Teammates, {}, viewer('m4')).matched).toEqual([])
  })
})

/**
 * A held list whose body reaches other rows (a path, an exists, a path from
 * the viewer) when a write changes what it reaches: the link a path starts
 * from, a field of the row it reaches, a row an exists counts, or the
 * viewer's own row. Each list is re-judged or fetched again, never kept as it
 * stood. Changes to members no reach reads keep it. operations-phase6-DESIGN.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Order, Relation } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, type NormalizedPatch } from '../src/index.js'
import { Answers } from './answers.js'

const TeamFields = Entity.define(
  'Team',
  Schema.Struct({ id: Schema.String, name: Schema.String, motto: Schema.String }),
)
const MemberFields = Entity.define(
  'Member',
  Schema.Struct({ id: Schema.String, handle: Schema.String }),
)
const NoteFields = Entity.define('Note', Schema.Struct({ id: Schema.String, org: Schema.String }))
const Org = Entity.relate(
  { Team: TeamFields, Member: MemberFields, Note: NoteFields },
  { Member: { team: Relation.one(TeamFields) } },
)
const { Team, Member, Note } = Org

/** Members of the team named by the input: a path from the row's own link. */
const OfTeam = Query.define('OfTeam', { name: Schema.String }, ({ input }) =>
  Query.from(Member).pipe(
    Query.where(Expr.eq(Expr.path(Member.relations.team, Team.fields.name), input.name)),
    Query.orderBy(Order.asc(Member.fields.handle)),
  ),
)
/** Teams some member points at: an exists over the rows pointing here. */
const Staffed = Query.define('Staffed', {}, () =>
  Query.from(Team).pipe(
    Query.where(Expr.exists(Member.relations.team)),
    Query.orderBy(Order.asc(Team.fields.name)),
  ),
)
/** Teams ada is on: an exists whose filter reads the pointing row. */
const Adas = Query.define('Adas', {}, () =>
  Query.from(Team).pipe(
    Query.where(Expr.exists(Member.relations.team, Expr.eq(Member.fields.handle, 'ada'))),
    Query.orderBy(Order.asc(Team.fields.name)),
  ),
)
/** Notes of the viewer's team's name: a path from the viewer. */
const Ours = Query.define('Ours', {}, () =>
  Query.from(Note).pipe(
    Query.where(
      Expr.eq(
        Note.fields.org,
        Expr.path(Expr.viewer(Member), Expr.path(Member.relations.team, Team.fields.name)),
      ),
    ),
    Query.orderBy(Order.asc(Note.fields.id)),
  ),
)

const Model = Schema.Struct({ remote: Remote.Model, me: Schema.String })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  mutations: [Answers],
  model: App.model.remote,
  entities: [Team, Member, Note],
  queries: [OfTeam, Staffed, Adas, Ours],
  viewer: model => Option.some(Remote.ref(Member, model.me)),
})

const ofRed = OfTeam.ref({ name: 'red' }).identity
const staffed = Staffed.ref({}).identity
const ours = Ours.ref({}).identity
const adas = Adas.ref({}).identity

const rows: ReadonlyArray<NormalizedPatch> = [
  { entity: 'Team', id: 't1', values: { id: 't1', name: 'red', motto: 'go' } },
  { entity: 'Team', id: 't2', values: { id: 't2', name: 'blue', motto: 'on' } },
  { entity: 'Member', id: 'm1', values: { id: 'm1', handle: 'ada', team: 'Team:t1' } },
  { entity: 'Member', id: 'm2', values: { id: 'm2', handle: 'bo', team: 'Team:t1' } },
  { entity: 'Note', id: 'n1', values: { id: 'n1', org: 'red' } },
]

const list = (model: Model, identity: string, entity: string, ids: ReadonlyArray<string>) =>
  Data.reduce(model, {
    _tag: 'ConnectionMerged',
    connection: identity,
    page: {
      edges: ids.map(id => ({ key: `${entity}:${id}`, ref: { entity, id } })),
      start: { _tag: 'Terminal' },
      end: { _tag: 'Terminal' },
    },
  })

/** Every row held, and each list as the server listed it, as m1 reads. */
const loaded = (): Model => {
  const stored = Data.reduce(
    { remote: Remote.initial, me: 'm1' },
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
  )
  const withTeams = list(list(stored, staffed, 'Team', ['t1']), adas, 'Team', ['t1'])
  return list(list(withTeams, ofRed, 'Member', ['m1', 'm2']), ours, 'Note', ['n1'])
}

const answered = (
  entities: ReadonlyArray<NormalizedPatch>,
  deleted: ReadonlyArray<{ readonly entity: string; readonly id: string }> = [],
): Model =>
  Data.reduce(loaded(), {
    _tag: 'MutationSucceeded',
    requestId: 'r1',
    entities: [...entities],
    deleted,
    now: 1,
  })

/** The list as it stands: its edges' ids, or fetched again. */
const shown = (model: Model, identity: string) =>
  model.remote.connections[identity]?.stale === true
    ? 'refetched'
    : Data.visibleItems(model.remote, identity).map(edge => edge.ref.id)

describe('a held list over a path, after a write to what the path reaches', () => {
  it('takes out a row relinked out of its path filter, judged over the store', () => {
    const model = answered([{ entity: 'Member', id: 'm2', values: { team: 'Team:t2' } }])
    expect(shown(model, ofRed)).toEqual(['m1'])
  })

  it('is fetched again when a row is relinked to a team the store does not hold', () => {
    const model = answered([{ entity: 'Member', id: 'm2', values: { team: 'Team:t9' } }])
    expect(shown(model, ofRed)).toBe('refetched')
  })

  it('does not keep its rows when the row they reach changes the field it reads', () => {
    const model = answered([{ entity: 'Team', id: 't1', values: { name: 'green' } }])
    expect(shown(model, ofRed)).toBe('refetched')
  })

  it('keeps its rows when the reached row changes a field no path reads', () => {
    const model = answered([{ entity: 'Team', id: 't1', values: { motto: 'stop' } }])
    expect(shown(model, ofRed)).toEqual(['m1', 'm2'])
  })

  it('does not keep its rows when the row they reach is deleted', () => {
    const model = answered([], [{ entity: 'Team', id: 't1' }])
    expect(shown(model, ofRed)).toBe('refetched')
  })
})

describe('a held list over an exists, after a write to the rows pointing here', () => {
  it('is fetched again when a pointing row is relinked away', () => {
    const model = answered([{ entity: 'Member', id: 'm1', values: { team: 'Team:t2' } }])
    expect(shown(model, staffed)).toBe('refetched')
  })

  it('is fetched again when a pointing row is deleted', () => {
    const model = answered([], [{ entity: 'Member', id: 'm2' }])
    expect(shown(model, staffed)).toBe('refetched')
  })

  it('keeps its rows when a pointing row changes a field the exists does not read', () => {
    const model = answered([{ entity: 'Member', id: 'm1', values: { handle: 'ade' } }])
    expect(shown(model, staffed)).toEqual(['t1'])
  })

  it('is fetched again when a pointing row changes a field the exists filters on', () => {
    const model = answered([{ entity: 'Member', id: 'm1', values: { handle: 'ade' } }])
    expect(shown(model, adas)).toBe('refetched')
  })
})

describe('a held list over a path from the viewer, after a write to the viewer’s row', () => {
  it('is fetched again when the viewer moves team', () => {
    const model = answered([{ entity: 'Member', id: 'm1', values: { team: 'Team:t2' } }])
    expect(shown(model, ours)).toBe('refetched')
  })
})

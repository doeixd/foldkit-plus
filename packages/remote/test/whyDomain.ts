/** The domain and Models `Data.why`'s tests read (#248). */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Order, Relation } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { Query, Remote, type RemoteMessage } from '../src/index.js'

const UserBase = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const ProjectBase = Entity.define(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.String,
    price: Schema.Number,
  }),
)
export const { User, Project } = Entity.relate(
  { User: UserBase, Project: ProjectBase },
  { Project: { owner: Relation.one(UserBase) } },
)
export const All = Query.define('All', {}, () =>
  Query.from(Project).pipe(Query.orderBy(Order.asc(Project.fields.id))),
)
/** Projects of one status, cheapest first. */
export const ByStatus = Query.define('ByStatus', { status: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.status, input.status)),
    Query.orderBy(Order.asc(Project.fields.price)),
  ),
)

export const Model = Schema.Struct({ remote: Remote.Model, open: Schema.NullOr(Schema.String) })
export type Model = typeof Model.Type
export const App = Surface.application({
  Model,
  Message: defineMessageUnion({ ...Remote.messages }),
})
export const Data = Remote.make({
  model: App.model.remote,
  entities: [User, Project],
  queries: [All, ByStatus],
})

export const card = Entity.select(Project, { name: true, status: true })
export const project = Data.get(card, 'p1')
export const list = Data.query(All, {}, { select: card, first: 25 })
export const summary = Entity.select(Project, { name: true })
export const active = Data.query(ByStatus, { status: 'active' }, { select: summary, first: 25 })

export const closed: Model = { remote: Remote.initial, open: null }
export const open: Model = { ...closed, open: 'p1' }

export const reduced = (model: Model, ...messages: ReadonlyArray<RemoteMessage>): Model =>
  messages.reduce(Data.reduce, model)

const rows = [
  { id: 'p1', name: 'Apollo', status: 'active', price: 10 },
  { id: 'p2', name: 'Borealis', status: 'active', price: 20 },
  { id: 'p4', name: 'Dawn', status: 'archived', price: 5 },
]

export const received = (
  values: ReadonlyArray<Readonly<Record<string, unknown>>>,
  entity = 'Project',
): RemoteMessage => ({
  _tag: 'ReadReceived',
  requests: values.map(row => ({ entity, id: String(row.id), fields: Object.keys(row) })),
  result: {
    settled: [],
    entities: values.map(row => ({ entity, id: String(row.id), values: row })),
  },
  now: 0,
})

export const merged = (identity: string, ids: ReadonlyArray<string>): RemoteMessage => ({
  _tag: 'ConnectionMerged',
  connection: identity,
  page: {
    edges: ids.map(id => ({ key: `Project:${id}`, ref: { entity: 'Project', id } })),
    start: { _tag: 'Terminal' },
    end: { _tag: 'Terminal' },
  },
})

export const stored = reduced(open, received(rows))
export const listed = reduced(stored, merged(active.ref.identity, ['p1', 'p2']))

export const p1 = { entity: 'Project', id: 'p1' }

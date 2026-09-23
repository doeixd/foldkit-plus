/**
 * What a Model change costs on the read path.
 *
 * local-execution-DESIGN §16.1.1. Two questions, and the answers point
 * opposite ways to the guess that prompted them:
 *
 * - **Building a projection** (`Data.query`) happens on every Model change,
 *   and re-encodes its input and re-walks its Selection each time. It looked
 *   like the hot path and is the cheapest thing here, flat in page size.
 * - **Reading one after an unrelated write** re-assembles and re-decodes every
 *   visible row, because the memo is keyed on the store object and any write
 *   makes a new one. It is linear in the page, and it is the real cost.
 *
 * Both are measured over a Selection that reaches through a relation, since
 * every real Selection in this repository does and assembly follows relations.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order, Relation } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, test } from 'vitest'
import { Query, Remote } from '../src/index.js'

// Vitest 5 hands `bench` to a test as a context fixture; this keeps each case one line.
const benchmark = (name: string, run: () => unknown) =>
  test(name, async ({ bench }) => {
    await bench(name, run).run()
  })

const User = DomainEntity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const ProjectBase = DomainEntity.define(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.String,
    ownerId: Schema.String,
    updatedAt: Schema.Number,
  }),
)
const Blog = DomainEntity.relate(
  { User, Project: ProjectBase },
  { Project: { owner: Relation.one(User) } },
)
const Project = Blog.Project

const Summary = DomainEntity.select(Project, {
  id: true,
  name: true,
  status: true,
  owner: DomainEntity.select(Blog.User, { name: true }),
})

const ByOwner = Query.define('ByOwner', { ownerId: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.ownerId, input.ownerId)),
    Query.orderBy(Order.desc(Project.fields.updatedAt)),
  ),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Blog.Project, Blog.User],
  queries: [ByOwner],
})

/** A loaded page of `page` rows, each reaching through `owner`. */
const scenario = (page: number) => {
  const projects = Data.query(ByOwner, { ownerId: 'u1' }, { select: Summary, first: page })
  const rows = Array.from({ length: page }, (_, n) => ({
    id: `p${n}`,
    name: `Project ${n}`,
    status: 'active',
    ownerId: 'u1',
    updatedAt: n,
    owner: 'User:u1',
  }))

  const merged = Data.reduce({ remote: Remote.initial } as Model, {
    _tag: 'ConnectionMerged',
    connection: projects.ref.identity,
    page: {
      edges: rows.map(row => ({
        key: `Project:${row.id}`,
        ref: { entity: 'Project', id: row.id },
      })),
      start: { _tag: 'Terminal' },
      end: { _tag: 'Terminal' },
    },
  })
  const loaded = Data.reduce(merged, {
    _tag: 'ReadReceived',
    requests: [
      ...rows.map(row => ({
        entity: 'Project',
        id: row.id,
        fields: ['id', 'name', 'status', 'owner'],
      })),
      { entity: 'User', id: 'u1', fields: ['name'] },
    ],
    result: {
      entities: [
        ...rows.map(row => ({ entity: 'Project', id: row.id, values: row })),
        { entity: 'User', id: 'u1', values: { name: 'Ada' } },
      ],
    },
    now: 0,
  })

  if (projects.read(loaded)._tag !== 'Ready') throw new Error('fixture is not Ready')
  return { projects, loaded, page }
}

let unrelated = 0

/** A write that touches nothing the page reads, and so should cost nothing. */
const write = (loaded: Model): Model =>
  Data.reduce(loaded, {
    _tag: 'ReadReceived',
    requests: [{ entity: 'User', id: `other${unrelated}`, fields: ['name'] }],
    result: { entities: [{ entity: 'User', id: `other${unrelated++}`, values: { name: 'x' } }] },
    now: 0,
  })

for (const size of [25, 100, 400]) {
  const { projects, loaded } = scenario(size)

  describe(`a page of ${size} rows`, () => {
    benchmark('Data.query — build one projection', () => {
      Data.query(ByOwner, { ownerId: 'u1' }, { select: Summary, first: size })
    })

    benchmark('read, same Model — the memo hit', () => {
      projects.read(loaded)
    })

    benchmark('read, after a write to one unrelated entity', () => {
      projects.read(write(loaded))
    })

    benchmark('the same write, without the read', () => {
      write(loaded)
    })

    benchmark('Remote.plan — what a subscription asks', () => {
      Remote.plan(Data, loaded, projects)
    })
  })
}

// @vitest-environment node
/**
 * A guarded domain served from memory through the real handlers: one Todo
 * read as its owner, a member of its project, an admin and a visitor.
 */
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Order, Relation } from 'foldkit-entity'
import { Query, REMOTE_PROTOCOL_VERSION, Remote, type Requirement } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const User = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(['admin', 'member']),
  projectIds: Schema.Array(Schema.String),
})
type User = typeof User.Type

const ProjectBase = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const NodeBase = Entity.define('Node', Schema.Struct({ id: Schema.String }))
const TagBase = Entity.define('Tag', Schema.Struct({ id: Schema.String }))
const {
  Project: ProjectFields,
  Todo: TodoFields,
  Node: NodeFields,
  Tag,
} = Entity.relate(
  {
    Project: ProjectBase,
    Node: NodeBase,
    Tag: TagBase,
    Todo: Entity.define(
      'Todo',
      Schema.Struct({
        id: Schema.String,
        ownerId: Schema.String,
        title: Schema.String,
        email: Schema.String,
        notes: Schema.String,
      }),
    ),
  },
  {
    Todo: { project: Relation.one(ProjectBase), tag: Relation.one(TagBase) },
    Node: { parent: Relation.one(NodeBase) },
  },
)

const G = Guards.declare(
  'Todos',
  User,
  guard => ({
    isAdmin: guard.principal(),
    isMember: guard.row(ProjectFields, p => Expr.in(ProjectFields.fields.id, p.projectIds)),
    isOwner: guard.row(TodoFields, p => Expr.eq(TodoFields.fields.ownerId, p.id)),
  }),
  { key: user => user.id },
)

const Project = ProjectFields.pipe(Guards.attach(G, { row: { Read: [G.isMember, G.isAdmin] } }))
const Todo = TodoFields.pipe(
  Guards.attach(G, {
    row: { Read: [G.isOwner, Guards.inherit('project'), G.isAdmin] },
    members: {
      email: { Read: Guards.on([G.isOwner, G.isAdmin], Guards.redact('hidden')) },
      notes: { Read: [G.isOwner] },
    },
    relations: { tag: { Read: [G.isOwner] } },
  }),
)

// Each node is readable when its parent is: a loop of parents is readable by no one.
const Node = NodeFields.pipe(Guards.attach(G, { row: { Read: [Guards.inherit('parent')] } }))

const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
})

const AllTodos = Query.define('AllTodos', {}, () =>
  Query.from(Todo).pipe(Query.orderBy(Order.asc(Todo.fields.id))),
)
const Data = Remote.define({ entities: [Todo, Project, Node, Tag], queries: [AllTodos] })

const rows = {
  Project: [
    { id: 'p1', name: 'Borealis' },
    { id: 'p2', name: 'Apollo' },
  ],
  Todo: [
    {
      id: 't1',
      ownerId: 'ada',
      title: 'Own',
      email: 'a@x',
      notes: 'n',
      project: 'Project:p2',
      tag: 'Tag:g1',
    },
    {
      id: 't2',
      ownerId: 'grace',
      title: 'Shared',
      email: 'g@x',
      notes: 'n',
      project: 'Project:p1',
      tag: 'Tag:g1',
    },
    {
      id: 't3',
      ownerId: 'grace',
      title: 'Hidden',
      email: 'g@x',
      notes: 'n',
      project: 'Project:p2',
    },
  ],
  Node: [
    { id: 'n1', parent: 'Node:n2' },
    { id: 'n2', parent: 'Node:n1' },
  ],
  Tag: [{ id: 'g1' }],
}

const ada: User = { id: 'ada', role: 'member', projectIds: ['p1'] }
const root: User = { id: 'root', role: 'admin', projectIds: [] }

const handlers = (principal: Option.Option<User>) =>
  RemoteServer.handlers(
    RemoteServer.memory({
      domain: Data,
      rows,
      principal,
      ...GuardServer.memory(Policy, [Todo, Project, Node]),
    }).server,
    principal,
  )

const read = (principal: Option.Option<User>, requests: ReadonlyArray<Requirement>) =>
  Effect.runPromise(
    handlers(principal).FoldkitRemoteRead({ version: REMOTE_PROTOCOL_VERSION, requests }),
  )

const listed = (principal: Option.Option<User>) =>
  Effect.runPromise(
    handlers(principal).FoldkitRemoteQuery({
      query: 'AllTodos',
      input: {},
      window: {},
      select: undefined,
    }),
  ).then(page => page.edges.map(edge => edge.id))

const byId = (principal: Option.Option<User>) =>
  read(
    principal,
    ['t1', 't2', 't3'].map(id => ({ entity: 'Todo', id, fields: ['title'] })),
  ).then(result => result.entities.map(entity => entity.id))

describe('a guarded domain in memory', () => {
  it('lists and reads by id the same rows for each principal', async () => {
    // Own, and through a project ada is a member of.
    expect(await listed(Option.some(ada))).toEqual(['t1', 't2'])
    expect(await byId(Option.some(ada))).toEqual(['t1', 't2'])
    expect(await listed(Option.some(root))).toEqual(['t1', 't2', 't3'])
    expect(await listed(Option.none())).toEqual([])
    expect(await byId(Option.none())).toEqual([])
  })

  it('follows a relation only to a row the principal may read', async () => {
    const result = await read(Option.some(ada), [
      { entity: 'Todo', id: 't1', fields: ['project'] },
      { entity: 'Todo', id: 't2', fields: ['project'] },
    ])
    expect(result.entities.map(entity => [entity.id, entity.values])).toEqual([
      ['t1', { project: null }],
      ['t2', { project: 'Project:p1' }],
    ])
  })

  it('redacts or withholds a member its rule refuses, per row', async () => {
    const result = await read(Option.some(ada), [
      { entity: 'Todo', id: 't1', fields: ['email', 'notes'] },
      { entity: 'Todo', id: 't2', fields: ['email', 'notes'] },
    ])
    expect(result.entities.map(entity => [entity.id, entity.values])).toEqual([
      ['t1', { email: 'a@x', notes: 'n' }],
      ['t2', { email: 'hidden' }],
    ])
    // Withheld, so the client reads it as unavailable and stops asking.
    expect(result.settled).toEqual([{ entity: 'Todo', id: 't2', fields: ['notes'] }])
  })

  it('withholds a relation its rule refuses, decided over the parent row', async () => {
    const result = await read(Option.some(ada), [
      { entity: 'Todo', id: 't1', fields: ['tag'] },
      { entity: 'Todo', id: 't2', fields: ['tag'] },
    ])
    expect(result.entities.map(entity => [entity.id, entity.values])).toEqual([
      ['t1', { tag: 'Tag:g1' }],
      ['t2', {}],
    ])
    expect(result.settled).toEqual([{ entity: 'Todo', id: 't2', fields: ['tag'] }])
  })

  it('decides an admin’s members by the principal guard alone', async () => {
    const result = await read(Option.some(root), [
      { entity: 'Todo', id: 't2', fields: ['email', 'notes'] },
    ])
    expect(result.entities[0]?.values).toEqual({ email: 'g@x' })
  })

  it('reads an Entity it was not given as open, and ends a loop of inherited Reads', async () => {
    const result = await read(Option.none(), [
      { entity: 'Tag', id: 'g1', fields: ['id'] },
      { entity: 'Node', id: 'n1', fields: ['id'] },
    ])
    expect(result.entities.map(entity => entity.id)).toEqual(['g1'])
  })
})

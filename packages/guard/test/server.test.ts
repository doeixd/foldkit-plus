// @vitest-environment node
/**
 * A guarded domain served from memory through the real handlers: one Todo
 * read as its owner, a member of its project, an admin and a visitor.
 */
import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import { RpcTest } from 'effect/rpc'
import { Entity, Expr, Order, Relation } from 'foldkit-entity'
import { Query, REMOTE_PROTOCOL_VERSION, Remote, RemoteRpc, type Requirement } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { Guards, Interaction, May, MaySchema } from '../src/index.js'
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
const Archive = Interaction.make('Archive')

const Todo = TodoFields.pipe(
  Guards.attach(G, {
    row: {
      Read: [G.isOwner, Guards.inherit('project'), G.isAdmin],
      Update: [G.isOwner, G.isAdmin],
      Delete: Guards.on([G.isAdmin], Guards.explain('Only an admin may delete a todo.')),
    },
    interactions: {
      [Archive.key]: [G.isOwner],
    },
    members: {
      email: { Read: Guards.on([G.isOwner, G.isAdmin], Guards.redact('hidden')) },
      notes: { Read: [G.isOwner] },
      ownerId: { Update: [G.isAdmin] },
    },
    relations: { tag: { Read: [G.isOwner], Link: [G.isAdmin] } },
  }),
  Guards.may,
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

  it('re-reads a live change under each subscriber’s own principal', async () => {
    const server = RemoteServer.memory({
      domain: Data,
      rows,
      principal: Option.none<User>(),
      ...GuardServer.memory(Policy, [Todo, Project, Node]),
    }).server
    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub([...server.entities.values()])
        const subscribe = (principal: Option.Option<User>) =>
          Effect.forkChild(
            Effect.gen(function* () {
              const client = yield* RpcTest.makeClient(RemoteRpc)
              return yield* client
                .FoldkitRemoteLive({
                  version: REMOTE_PROTOCOL_VERSION,
                  requirements: [{ entity: 'Todo', id: 't2', fields: ['email'] }],
                  after: 0,
                })
                .pipe(Stream.take(1), Stream.runCollect)
            }).pipe(
              Effect.scoped,
              Effect.provide(
                RemoteRpc.toLayer(RemoteServer.handlers(server, principal, { live: hub })),
              ),
            ),
          )
        const asAda = yield* subscribe(Option.some(ada))
        const asRoot = yield* subscribe(Option.some(root))
        for (let i = 0; i < 5; i++) yield* Effect.yieldNow
        yield* hub.changed({ entity: 'Todo', id: 't2' }, ['email'])
        return [...(yield* Fiber.join(asAda)), ...(yield* Fiber.join(asRoot))]
      }),
    )
    // One change, two readers: ada through the project sees it redacted, an admin as it is.
    expect(events).toMatchObject([
      { _tag: 'EntityPatched', id: 't2', values: { email: 'hidden' } },
      { _tag: 'EntityPatched', id: 't2', values: { email: 'g@x' } },
    ])
  })

  it('answers each request as the principal provided to it, sharing a re-read by key', async () => {
    const guarded = GuardServer.memory(Policy, [Todo, Project, Node])
    const decided: Array<Option.Option<User>> = []
    const server = RemoteServer.memory({
      domain: Data,
      rows,
      principal: Option.none<User>(),
      ...guarded,
      readable: (principal, row) => {
        decided.push(principal)
        return guarded.readable(principal, row)
      },
    }).server
    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub([...server.entities.values()], {
          key: Policy.keyOf,
        })
        // One handler set for every request, as an RPC layer builds it once.
        const answering = RemoteServer.handlers(server, G.Principal, { live: hub })
        const subscribe = (principal: Option.Option<User>) =>
          Effect.forkChild(
            answering
              .FoldkitRemoteLive({
                version: REMOTE_PROTOCOL_VERSION,
                requirements: [{ entity: 'Todo', id: 't2', fields: ['email'] }],
                after: 0,
              })
              .pipe(
                Stream.provideService(G.Principal, principal),
                Stream.take(1),
                Stream.runCollect,
              ),
          )
        // Two requests by ada, each with a principal of its own, and one by an admin.
        const fibers = [
          yield* subscribe(Option.some({ ...ada })),
          yield* subscribe(Option.some({ ...ada })),
          yield* subscribe(Option.some(root)),
        ]
        for (let i = 0; i < 5; i++) yield* Effect.yieldNow
        decided.length = 0
        yield* hub.changed({ entity: 'Todo', id: 't2' }, ['email'])
        return yield* Effect.forEach(fibers, Fiber.join)
      }),
    )
    expect(events.map(each => [...each])).toMatchObject([
      [{ values: { email: 'hidden' } }],
      [{ values: { email: 'hidden' } }],
      [{ values: { email: 'g@x' } }],
    ])
    expect(decided.map(principal => Option.getOrThrow(principal).id)).toEqual(['ada', 'root'])
  })

  it('answers may for each row as its reader may act on it', async () => {
    const mayOf = (principal: Option.Option<User>) =>
      read(principal, [
        { entity: 'Todo', id: 't1', fields: ['may'] },
        { entity: 'Todo', id: 't2', fields: ['may'] },
      ]).then(result =>
        Object.fromEntries(result.entities.map(entity => [entity.id, entity.values.may])),
      )
    // ada owns t1 and reads t2 through its project.
    expect(await mayOf(Option.some(ada))).toEqual({
      t1: {
        row: { Update: true, Delete: false, Archive: true },
        reasons: { Delete: 'Only an admin may delete a todo.' },
        members: { ownerId: false },
        relations: { tag: { Link: false, Unlink: true } },
      },
      t2: {
        row: { Update: false, Delete: false, Archive: false },
        reasons: { Delete: 'Only an admin may delete a todo.' },
        members: { ownerId: false },
        relations: { tag: { Link: false, Unlink: true } },
      },
    })
    expect((await mayOf(Option.some(root))).t2).toEqual({
      row: { Update: true, Delete: true, Archive: false },
      reasons: {},
      members: { ownerId: true },
      relations: { tag: { Link: true, Unlink: true } },
    })
  })

  it('reads may through May, a member or relation joining the row’s Update', async () => {
    const result = await read(Option.some(ada), [{ entity: 'Todo', id: 't1', fields: ['may'] }])
    const may = Schema.decodeUnknownSync(MaySchema)(result.entities[0]!.values.may)
    expect(May.can(may, 'Update')).toBe(true)
    expect(May.can(may, Archive.key)).toBe(true)
    // Why, where the rule explained it: words for whoever asked, and only then.
    expect(May.reason(may, 'Delete')).toEqual(Option.some('Only an admin may delete a todo.'))
    expect(May.reason(may, 'Update')).toEqual(Option.none())
    const shared = Schema.decodeUnknownSync(MaySchema)(
      (await read(Option.some(ada), [{ entity: 'Todo', id: 't2', fields: ['may'] }])).entities[0]!
        .values.may,
    )
    expect(May.reason(shared, 'Update')).toEqual(Option.none())
    expect(May.canSet(may, Todo, 'title')).toBe(true)
    expect(May.canSet(may, Todo, 'ownerId')).toBe(false)
    expect(May.canLink(may, Todo, 'tag', 'Unlink')).toBe(true)
    expect(May.canLink(may, Todo, 'tag', 'Link')).toBe(false)
    const readOnly = { ...may, row: { ...may.row, Update: false } }
    expect(May.canSet(readOnly, Todo, 'title')).toBe(false)
    expect(May.canLink(readOnly, Todo, 'tag', 'Unlink')).toBe(false)
    // @ts-expect-error a member the Entity does not have
    May.canSet(may, Todo, 'colour')
  })

  it('locks for Crud what the reader may not set, and nothing while may is not answered', async () => {
    const result = await read(Option.some(ada), [{ entity: 'Todo', id: 't1', fields: ['may'] }])
    const row = result.entities[0]!.values
    const locks = May.locks(Todo)
    expect(locks.select).toEqual({ may: true })
    expect(['title', 'ownerId', 'tag'].map(member => locks.locked(row, member))).toEqual([
      false,
      true,
      // ada may unlink t1's tag, not link one: a relation needs both.
      true,
    ])
    expect(locks.locked({}, 'ownerId')).toBe(false)
  })

  it('reads an Entity it was not given as open, and ends a loop of inherited Reads', async () => {
    const result = await read(Option.none(), [
      { entity: 'Tag', id: 'g1', fields: ['id'] },
      { entity: 'Node', id: 'n1', fields: ['id'] },
    ])
    expect(result.entities.map(entity => entity.id)).toEqual(['g1'])
  })
})

describe('GuardServer.validate', () => {
  const backend = (guarded: boolean) =>
    RemoteServer.memory({
      domain: Data,
      rows,
      principal: Option.none<User>(),
      ...(guarded ? GuardServer.memory(Policy, [Todo, Project, Node]) : {}),
    }).server

  it('passes a backend that applies every guard', () => {
    expect(() =>
      GuardServer.validate(Policy, {
        entities: [Todo, Project, Node],
        domain: Data,
        server: backend(true),
      }),
    ).not.toThrow()
  })

  it('names each Source and query that would serve a guarded row unguarded', () => {
    expect(() =>
      GuardServer.validate(Policy, { entities: [Todo], domain: Data, server: backend(false) }),
    ).toThrow(
      "Todo's Source does not apply its Read rules; Todo's Source does not apply its members' Read rules; query AllTodos lists Todo without its Read rules",
    )
  })

  it('refuses a shared field a Read rule could tell its readers apart by', () => {
    const CardRelated = Entity.relate(
      {
        Card: Entity.define(
          'Card',
          Schema.Struct({ id: Schema.String, title: Schema.String, secret: Schema.String }),
        ),
        Project: ProjectBase,
      },
      { Card: { project: Relation.one(ProjectBase) } },
    )
    const Card = CardRelated.Card.pipe(
      Guards.attach(G, { members: { secret: { Read: [G.isAdmin] } } }),
    )
    const sharing =
      (shared: Readonly<Record<string, ReadonlyArray<string>>>, card: typeof Card = Card) =>
      () =>
        GuardServer.validate(Policy, {
          entities: [card, Todo, Project],
          domain: Data,
          server: RemoteServer.memory({
            domain: Remote.define({ entities: [card, Todo, Project, Tag] }),
            rows: { Card: [], Todo: [], Project: [], Tag: [] },
            principal: Option.none<User>(),
            shared,
            ...GuardServer.memory(Policy, [card, Todo, Project]),
          }).server,
        })
    expect(sharing({ Card: ['title'] })).not.toThrow()
    expect(sharing({ Card: ['secret', 'project'] })).toThrow(
      "Card's Source shares secret, which has a Read rule; Card's Source shares project, whose rows have a Read rule",
    )
    // Only an admin reads any Card: an `always` tells readers apart too.
    const Watched = CardRelated.Card.pipe(Guards.attach(G, { always: [G.isAdmin] }))
    expect(sharing({ Card: ['title'] }, Watched)).toThrow(
      "Card's Source shares title, but its rows have a Read rule",
    )
    expect(sharing({ Todo: ['tag'] })).toThrow(
      "Todo's Source shares tag, but its rows have a Read rule; Todo's Source shares tag, which has a Read rule",
    )
  })

  it('refuses rules built from another Policy, or another set', () => {
    const Other = G.implement({ isAdmin: () => false })
    expect(() =>
      GuardServer.validate(Other, { entities: [Project], domain: Data, server: backend(true) }),
    ).toThrow("Project's Source does not apply its Read rules")
    const H = Guards.declare('Others', User, guard => ({ isAdmin: guard.principal() }), {
      key: user => user.id,
    })
    expect(() =>
      GuardServer.validate(H.implement({ isAdmin: () => true }), {
        entities: [Project],
        domain: Data,
        server: backend(true),
      }),
    ).toThrow('Project carries the guards of Todos, not Others')
  })
})

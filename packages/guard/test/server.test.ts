// @vitest-environment node
/**
 * A guarded domain served from memory through the real handlers: one Todo
 * read as its owner, a member of its project, an admin and a visitor.
 */
import { Context, Effect, Fiber, Option, Schema, Stream } from 'effect'
import { RpcTest } from 'effect/rpc'
import { TestClock } from 'effect/testing'
import { Entity, Expr, Operators, Order, Relation } from 'foldkit-entity'
import {
  Query,
  REMOTE_PROTOCOL_VERSION,
  Remote,
  RemoteRpc,
  entityKey,
  type LiveChange,
  type Requirement,
} from 'foldkit-remote'
import { pollLive } from 'foldkit-remote-drizzle'
import { RemoteServer, type LiveSource, type MemoryStore } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { Condition, Guards, Interaction, May, MaySchema, type Policy } from '../src/index.js'
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
  { key: user => user.id, unguarded: 'allow' },
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

describe('pollLive over the guarded Source', () => {
  /** A row ada may read: grace's, in ada's project p1. */
  const shared = { ownerId: 'grace', email: 'g@x', notes: 'n', project: 'Project:p1' }

  /**
   * What ada's stream sends, polling every second through the guarded Todo
   * Source, while each write lands before the tick after it. The watched list's
   * window is every stored row, unguarded: only the Source decides what is sent.
   */
  const polled = (
    requirements: ReadonlyArray<Requirement>,
    writes: ReadonlyArray<(store: MemoryStore) => void>,
  ) => {
    const backend = RemoteServer.memory({
      domain: Data,
      rows,
      principal: Option.none<User>(),
      ...GuardServer.memory(Policy, [Todo, Project, Node]),
    })
    const live = pollLive(backend.server.entities.get('Todo')!, {
      every: '1 second',
      lists: [
        {
          identity: 'AllTodos',
          watchId: 'watch',
          fields: ['id', 'title', 'notes'],
          edges: () =>
            Effect.sync(() =>
              backend.rows('Todo').map(row => {
                const id = String(row.id)
                return { entity: 'Todo', id, key: entityKey('Todo', id) }
              }),
            ),
        },
      ],
    })
    return Effect.runPromise(
      Effect.gen(function* () {
        const sent: Array<typeof LiveChange.Type> = []
        const fiber = yield* live
          .subscribe({ requirements, after: 0, principal: Option.some(ada) })
          .pipe(
            Stream.runForEach(change => Effect.sync(() => void sent.push(change))),
            Effect.forkChild,
          )
        for (let i = 0; i < 100; i++) yield* Effect.yieldNow
        for (const write of writes) {
          write(backend)
          yield* TestClock.adjust('1 second')
          for (let i = 0; i < 100; i++) yield* Effect.yieldNow
        }
        yield* Fiber.interrupt(fiber)
        return sent
      }).pipe(Effect.provide(TestClock.layer())),
    )
  }

  it('never sends a member its rule withholds or redacts, nor a row it hides', async () => {
    const sent = await polled(
      [
        { entity: 'Todo', id: 't2', fields: ['title', 'notes', 'email'] },
        { entity: 'Todo', id: 't3', fields: ['title', 'notes'] },
      ],
      [
        store => {
          store.write('Todo', 't2', { title: 'Shared!', notes: 'secret', email: 'z@x' })
          store.write('Todo', 't3', { title: 'Hidden!', notes: 'secret' })
        },
      ],
    )
    // `notes` is grace's alone, and `email` reads `hidden` to ada before and after.
    expect(sent).toEqual([
      {
        _tag: 'EntityPatched',
        entity: 'Todo',
        id: 't2',
        values: { title: 'Shared!' },
        changed: ['title'],
        cursor: 1,
      },
    ])
  })

  it('sends a member once its rule lets the principal read it, and nothing when it stops', async () => {
    const sent = await polled(
      [{ entity: 'Todo', id: 't2', fields: ['title', 'notes'] }],
      [
        store => store.write('Todo', 't2', { ownerId: 'ada' }),
        store => store.write('Todo', 't2', { ownerId: 'grace', notes: 'secret' }),
      ],
    )
    // Ada keeps the notes she was let read; the ones written after are not hers.
    expect(sent).toEqual([
      {
        _tag: 'EntityPatched',
        entity: 'Todo',
        id: 't2',
        values: { notes: 'n' },
        changed: ['notes'],
        cursor: 1,
      },
    ])
  })

  it('deletes a subscribed row that leaves what the principal may read', async () => {
    const sent = await polled(
      [{ entity: 'Todo', id: 't2', fields: ['title'] }],
      [store => store.write('Todo', 't2', { project: 'Project:p2' })],
    )
    expect(sent).toEqual([{ _tag: 'EntityDeleted', entity: 'Todo', id: 't2', cursor: 1 }])
  })

  it('joins a watched list with the rows the principal may read, as it may read them', async () => {
    const sent = await polled(
      [{ entity: 'Todo', id: 'watch', fields: ['title'] }],
      [
        store => {
          store.write('Todo', 't4', { ...shared, title: 'Joined', notes: 'secret' })
          store.write('Todo', 't5', { ...shared, title: 'Elsewhere', project: 'Project:p2' })
        },
        store => store.write('Todo', 't4', { project: 'Project:p2' }),
      ],
    )
    const edge = { entity: 'Todo', id: 't4', key: entityKey('Todo', 't4') }
    expect(sent).toEqual([
      { _tag: 'ConnectionInvalidate', connection: 'AllTodos', cursor: 1 },
      {
        _tag: 'EntityPatched',
        entity: 'Todo',
        id: 't4',
        values: { id: 't4', title: 'Joined' },
        changed: ['id', 'title'],
        cursor: 2,
      },
      { _tag: 'ConnectionInsert', connection: 'AllTodos', position: 'prepend', edge, cursor: 3 },
      { _tag: 'EntityDeleted', entity: 'Todo', id: 't4', cursor: 4 },
      { _tag: 'ConnectionRemove', connection: 'AllTodos', edge, cursor: 5 },
    ])
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
    // Whether its rows are ruled is unknown when its target is not validated.
    expect(() =>
      GuardServer.validate(Policy, {
        entities: [Card],
        domain: Data,
        server: RemoteServer.memory({
          domain: Remote.define({ entities: [Card, Project] }),
          rows: { Card: [], Project: [] },
          principal: Option.none<User>(),
          shared: { Card: ['project'] },
          ...GuardServer.memory(Policy, [Card]),
        }).server,
      }),
    ).toThrow("Card's Source shares project, whose Project is not validated")
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
    // Anyone reads them: `anyone` tells no readers apart.
    const Open = CardRelated.Card.pipe(
      Guards.attach(G, {
        row: { Read: [Guards.anyone] },
        members: { secret: { Read: [Guards.anyone] } },
        always: [Guards.anyone],
      }),
    )
    expect(sharing({ Card: ['title', 'secret'] }, Open)).not.toThrow()
  })

  it('refuses rules built from an Entity before its guards were attached', () => {
    const unguarded = RemoteServer.memory({
      domain: Data,
      rows,
      principal: Option.none<User>(),
      ...GuardServer.memory(Policy, [TodoFields, ProjectFields, NodeFields]),
    }).server
    expect(() =>
      GuardServer.validate(Policy, { entities: [Todo], domain: Data, server: unguarded }),
    ).toThrow("Todo's Source does not apply its Read rules")
  })

  it('passes a live Source polling through the Source it checks, and refuses any other', () => {
    const server = backend(true)
    const serving = (live: LiveSource<Option.Option<User>>) => () =>
      GuardServer.validate(Policy, {
        entities: [Todo],
        domain: Data,
        server: { ...server, live: new Map([['Todo', live]]) },
      })
    expect(serving(pollLive(server.entities.get('Todo')!))).not.toThrow()
    const refused =
      "Todo's live Source does not read through its guarded Source; poll through that Source (pollLive) or serve changes through a live hub"
    // The same table through a Source with no rules.
    expect(serving(pollLive(backend(false).entities.get('Todo')!))).toThrow(refused)
    expect(
      serving(RemoteServer.live<Option.Option<User>>(Todo, { subscribe: () => Stream.empty })),
    ).toThrow(refused)
  })

  it('refuses a query the domain does not declare', () => {
    const server = backend(true)
    const Extra = Query.define('Extra', {}, () => Query.from(Todo))
    expect(() =>
      GuardServer.validate(Policy, {
        entities: [Todo],
        domain: Data,
        server: {
          ...server,
          queries: new Map([
            ...server.queries,
            ['Extra', RemoteServer.query(Extra, () => Effect.die('unused'))],
          ]),
        },
      }),
    ).toThrow('query Extra is served, but the domain does not declare it')
  })

  it('refuses a body that filters or orders by a member with a Read rule', () => {
    // A row comes back without its notes, but `notes contains $text` still answers for them.
    const ByNotes = Query.define('ByNotes', { text: Schema.String }, ({ input }) =>
      Query.from(Todo).pipe(Query.where(Expr.contains(Todo.fields.notes, input.text))),
    )
    const ByEmail = Query.define('ByEmail', {}, () =>
      Query.from(Todo).pipe(Query.orderBy(Order.asc(Todo.fields.email))),
    )
    const ByTitle = Query.define('ByTitle', { text: Schema.String }, ({ input }) =>
      Query.from(Todo).pipe(
        Query.where(Expr.contains(Todo.fields.title, input.text)),
        Query.orderBy(Order.asc(Todo.fields.title)),
      ),
    )
    // A title hidden on another Entity says nothing of a Todo's.
    const Note = Entity.define(
      'Note',
      Schema.Struct({ id: Schema.String, title: Schema.String }),
    ).pipe(Guards.attach(G, { members: { title: { Read: [G.isAdmin] } } }))
    const validating =
      (queries: ReadonlyArray<typeof ByNotes | typeof ByEmail | typeof ByTitle>) => () =>
        GuardServer.validate(Policy, {
          entities: [Todo, Project, Node, Note],
          domain: Remote.define({
            entities: [Todo, Project, Node, Tag, Note],
            queries: [AllTodos, ...queries],
          }),
          server: backend(true),
        })
    expect(validating([ByTitle])).not.toThrow()
    expect(validating([ByNotes, ByEmail])).toThrow(
      'query ByNotes filters Todo by notes, which has a Read rule; query ByEmail orders Todo by email, which has a Read rule',
    )
  })

  it('refuses a body that reaches a member with a Read rule through another row', () => {
    // SQL reads a reached row under its `visible` rule, never its members': a
    // path, a path from the viewer, or an exists answers for what each hides.
    const ByTag = Query.define('ByTag', { tag: Schema.String }, ({ input }) =>
      Query.from(Todo).pipe(
        Query.where(Expr.eq(Expr.path(Todo.relations.tag, TagBase.fields.id), input.tag)),
      ),
    )
    const AsNotes = Query.define('AsNotes', {}, () =>
      Query.from(Project).pipe(
        Query.where(Expr.eq(Project.fields.name, Expr.path(Expr.viewer(Todo), Todo.fields.notes))),
      ),
    )
    const NotedIn = Query.define('NotedIn', { text: Schema.String }, ({ input }) =>
      Query.from(Project).pipe(
        Query.where(
          Expr.exists(Todo.relations.project, Expr.contains(Todo.fields.notes, input.text)),
        ),
      ),
    )
    // What a reached row shows everyone says nothing it hides.
    const Named = Query.define('Named', { name: Schema.String }, ({ input }) =>
      Query.from(Todo).pipe(
        Query.where(Expr.eq(Expr.path(Todo.relations.project, Project.fields.name), input.name)),
      ),
    )
    const validating =
      (query: typeof ByTag | typeof AsNotes | typeof NotedIn | typeof Named) => () =>
        GuardServer.validate(Policy, {
          entities: [Todo, Project, Node],
          domain: Remote.define({
            entities: [Todo, Project, Node, Tag],
            queries: [AllTodos, query],
          }),
          server: backend(true),
        })
    expect(validating(Named)).not.toThrow()
    expect(validating(ByTag)).toThrow("query ByTag reaches Todo's tag, which has a Read rule")
    expect(validating(AsNotes)).toThrow("query AsNotes reaches Todo's notes, which has a Read rule")
    expect(validating(NotedIn)).toThrow("query NotedIn reaches Todo's notes, which has a Read rule")
  })

  it('refuses rules built from another Policy, or another set', () => {
    const Other = G.implement({ isAdmin: () => false })
    expect(() =>
      GuardServer.validate(Other, { entities: [Project], domain: Data, server: backend(true) }),
    ).toThrow("Project's Source does not apply its Read rules")
    const H = Guards.declare('Others', User, guard => ({ isAdmin: guard.principal() }), {
      key: user => user.id,
      unguarded: 'allow',
    })
    expect(() =>
      GuardServer.validate(H.implement({ isAdmin: () => true }), {
        entities: [Project],
        domain: Data,
        server: backend(true),
      }),
    ).toThrow('Project carries the guards of Todos, not Others')
  })

  it('applies a provided Policy, and counts what it builds as its origin’s', async () => {
    class Admins extends Context.Service<Admins, ReadonlyArray<string>>()('server-test/Admins') {}
    const Needing = G.implement({
      isAdmin: principal =>
        Effect.map(Admins, admins => Option.exists(principal, user => admins.includes(user.id))),
    })
    const server = RemoteServer.memory({
      domain: Data,
      rows,
      principal: Option.none<User>(),
      ...GuardServer.memory(Needing.provide(Context.make(Admins, ['zoe'])), [Todo, Project, Node]),
    }).server
    expect(() =>
      GuardServer.validate(Needing, { entities: [Todo, Project, Node], domain: Data, server }),
    ).not.toThrow()
    expect(() => GuardServer.validate(Policy, { entities: [Todo], domain: Data, server })).toThrow(
      "Todo's Source does not apply its Read rules",
    )
    // zoe owns nothing and is in no project: only the provided list makes her an admin.
    const zoe = Option.some<User>({ id: 'zoe', role: 'member', projectIds: [] })
    const answered = await Effect.runPromise(
      RemoteServer.handlers(server, zoe).FoldkitRemoteRead({
        version: REMOTE_PROTOCOL_VERSION,
        requests: ['t1', 't2'].map(id => ({ entity: 'Todo', id, fields: ['title'] })),
      }),
    )
    expect(answered.entities.map(({ id }) => id)).toEqual(['t1', 't2'])
  })

  it('keeps what an earlier provide gave, and its origin, through a second one', async () => {
    class Admins extends Context.Service<Admins, ReadonlyArray<string>>()('server-test/Admins') {}
    const Needing = G.implement({
      isAdmin: principal =>
        Effect.map(Admins, admins => Option.exists(principal, user => admins.includes(user.id))),
    })
    const Twice = Needing.provide(Context.make(Admins, ['zoe'])).provide(Context.empty())
    const server = RemoteServer.memory({
      domain: Data,
      rows,
      principal: Option.none<User>(),
      ...GuardServer.memory(Twice, [Todo, Project, Node]),
    }).server
    expect(() =>
      GuardServer.validate(Needing, { entities: [Todo, Project, Node], domain: Data, server }),
    ).not.toThrow()
    const zoe = Option.some<User>({ id: 'zoe', role: 'member', projectIds: [] })
    // Each Effect the bodies run in, decided with the provided list.
    expect(
      await Effect.runPromise(Twice.decide(G.isAdmin, { principal: zoe, interaction: 'Read' })),
    ).toBe(true)
    expect(await Effect.runPromise(Twice.writable(Todo, zoe, 'Delete'))).toMatchObject({
      condition: { _tag: 'Always' },
    })
    expect(
      await Effect.runPromise(Twice.writeMembers(Todo, zoe, ['ownerId'], 'Update')),
    ).toMatchObject([{ condition: { _tag: 'Always' } }])
  })
})

describe('A rule calling a primitive operator', () => {
  const short = Expr.operator('acme.short', { input: [Schema.String], output: Schema.Boolean })
  const shortLive = Operators.memory(Operators.implement(short, name => name.length < 5))
  const PlainFields = Entity.define(
    'Plain',
    Schema.Struct({ id: Schema.String, name: Schema.String }),
  )
  const P = Guards.declare(
    'Plains',
    User,
    guard => ({ isShort: guard.row(PlainFields, () => short(PlainFields.fields.name)) }),
    { key: user => user.id, unguarded: 'allow' },
  )
  // An Update rule runs in memory only: no SQL ever compiles it.
  const Plain = PlainFields.pipe(Guards.attach(P, { row: { Update: [P.isShort] } }))
  const PlainData = Remote.define({ entities: [Plain], queries: [] })
  const server = (policy: Policy<User>) =>
    RemoteServer.memory({
      domain: PlainData,
      rows: { Plain: [{ id: 'x1', name: 'Bolt' }] },
      principal: Option.none<User>(),
      ...GuardServer.memory(policy, [Plain]),
    }).server

  it('is refused at startup when the policy does not run the operator', () => {
    const without = P.implement({})
    expect(() =>
      GuardServer.validate(without, {
        entities: [Plain],
        domain: PlainData,
        server: server(without),
      }),
    ).toThrow("Plain's isShort calls acme.short, which the policy does not run")
  })

  it('is decided by the policy’s table: a guard asked alone, and a row read in memory', async () => {
    const policy = P.implement({}, { operators: shortLive })
    const asked = (name: string) =>
      Effect.runPromise(
        policy.decide(P.isShort, {
          principal: Option.none(),
          interaction: 'Update',
          row: { id: 'x', name },
        }),
      )
    expect([await asked('Bolt'), await asked('Bolt cutter')]).toEqual([true, false])
    const Read = PlainFields.pipe(Guards.attach(P, { row: { Read: [P.isShort] } }))
    const ReadData = Remote.define({ entities: [Read], queries: [] })
    const backend = RemoteServer.memory({
      domain: ReadData,
      rows: {
        Plain: [
          { id: 'x1', name: 'Bolt' },
          { id: 'x2', name: 'Bolt cutter' },
        ],
      },
      principal: Option.none<User>(),
      ...GuardServer.memory(policy, [Read]),
    })
    const result = await Effect.runPromise(
      RemoteServer.handlers(backend.server, Option.none<User>()).FoldkitRemoteRead({
        version: REMOTE_PROTOCOL_VERSION,
        requests: ['x1', 'x2'].map(id => ({ entity: 'Plain', id, fields: ['name'] })),
      }),
    )
    expect(result.entities.map(entity => entity.id)).toEqual(['x1'])
  })

  it('starts, and is decided by the policy’s table, when it does', async () => {
    const policy = P.implement({}, { operators: shortLive })
    expect(() =>
      GuardServer.validate(policy, {
        entities: [Plain],
        domain: PlainData,
        server: server(policy),
      }),
    ).not.toThrow()
    const rule = await Effect.runPromise(policy.writable(Plain, Option.none(), 'Update'))
    expect(
      Condition.holds(rule.condition, { name: 'Bolt' }, {}, () => false, policy.operators),
    ).toBe(true)
    expect(
      Condition.holds(rule.condition, { name: 'Bolt cutter' }, {}, () => false, policy.operators),
    ).toBe(false)
  })
})

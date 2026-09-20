import { Schema } from 'effect'
import { Derived, Entity as Domain, Relation } from 'foldkit-entity'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Query,
  Remote,
  Selection,
  emptyStore,
  entityKey,
  initialRemoteModel,
  missingFields,
  relationShape,
  requirementsOf,
  writeEntity,
  type EntityStore,
} from '../src/index.js'

const User = Domain.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Comment = Domain.define('Comment', Schema.Struct({ id: Schema.String, body: Schema.String }))
const Project = Domain.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
).pipe(Domain.derived({ commentCount: Derived.make(Schema.Number) }))

const Work = Domain.relate(
  { User, Comment, Project },
  {
    Comment: { author: Relation.one(User) },
    Project: {
      owner: Relation.one(User),
      reviewer: Relation.one(User, { optional: true }),
      comments: Relation.many(Comment),
      parent: Relation.one(Project, { optional: true }),
    },
  },
)

const UserSummary = Domain.select(Work.User, { id: true, name: true })
const ProjectCard = Domain.select(Work.Project, {
  name: true,
  commentCount: true,
  owner: UserSummary,
  reviewer: UserSummary,
  comments: Domain.select(Work.Comment, { body: true, author: UserSummary }),
  parent: true,
})

const UserSummaryOfProject = Domain.select(Work.Project, { name: true, owner: UserSummary })

const entities = [Entity.from(Work.User), Entity.from(Work.Comment), Entity.from(Work.Project)]
const Data = Remote.define({ entities })
const Model = Schema.Struct({ remote: Data.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ Ping: {} }) })
const AppRemote = Remote.at(Data, App.model.remote)
const root = (store: EntityStore) => ({ remote: { ...initialRemoteModel, entities: store } })

const storeWith = (users: ReadonlyArray<readonly [id: string, name: string]>): EntityStore => {
  let store = writeEntity(emptyStore, entityKey('Project', 'p1'), {
    name: 'Apollo',
    commentCount: 1,
    owner: 'User:u1',
    reviewer: null,
    comments: ['Comment:c1'],
    parent: 'Project:p0',
  })
  for (const [id, name] of users) store = writeEntity(store, entityKey('User', id), { id, name })
  return writeEntity(store, entityKey('Comment', 'c1'), { body: 'hi', author: 'User:u2' })
}
const fullStore = (): EntityStore =>
  storeWith([
    ['u1', 'ada'],
    ['u2', 'grace'],
  ])

describe('Entity.from', () => {
  const descriptor = Entity.from(Work.Project)

  it('keeps fields and derived members, and turns relations into ref fields', () => {
    expect(descriptor.name).toBe('Project')
    expect(Object.keys(descriptor.fields)).toEqual([
      'id',
      'name',
      'owner',
      'reviewer',
      'comments',
      'parent',
      'commentCount',
    ])
    expect(descriptor.fields.name).toBe(Work.Project.fields.name.schema)
    expect(descriptor.fields.commentCount).toBe(Schema.Number)
  })

  it.each([
    ['owner', { kind: 'one', nullable: false, entity: 'User' }],
    ['reviewer', { kind: 'one', nullable: true, entity: 'User' }],
    ['comments', { kind: 'many', nullable: false, entity: 'Comment' }],
    ['parent', { kind: 'one', nullable: true, entity: 'Project' }],
  ] as const)('gives %s the relation shape Remote reads', (key, shape) => {
    expect(relationShape(descriptor.fields[key])).toEqual(shape)
  })

  it('is the same descriptor each time, so a registry and a Selection agree', () => {
    expect(Entity.from(Work.Project)).toBe(descriptor)
  })

  it('refuses a field named like a page of a relation', () => {
    expect(() =>
      Entity.make('Odd', Schema.Struct({ id: Schema.String, 'notes@first=1': Schema.String })),
    ).toThrow('field "notes@first=1" of "Odd" contains "@"')
  })

  it('needs an id field', () => {
    const Keyless = Domain.define('Keyless', Schema.Struct({ name: Schema.String }))
    expect(() => Entity.from(Keyless as never)).toThrow(
      'Entity.from: "Keyless" needs an "id" field for Remote to key it by',
    )
  })
})

describe('Selection.from', () => {
  const selection = Selection.from(ProjectCard)

  it('compiles an Entity Selection once, so a read made on every render is the same read', () => {
    expect(Selection.from(ProjectCard)).toBe(selection)
    // Remote caches a read by its Selection, so the value is the same one, not an equal one.
    const model = root(fullStore())
    const read = () => Remote.select(AppRemote, Selection.from(ProjectCard))('p1').read(model)
    const [first, second] = [read(), read()]
    expect(first._tag === 'Ready' && second._tag === 'Ready' && first.value).toBe(
      second._tag === 'Ready' ? second.value : undefined,
    )
  })

  it('states the same requirement graph a hand-written Remote Selection would', () => {
    const Hand = {
      User: Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String })),
    }
    const HandComment = Entity.make(
      'Comment',
      Schema.Struct({ id: Schema.String, body: Schema.String, author: Entity.ref(Hand.User) }),
    )
    const HandProject = Entity.make(
      'Project',
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        commentCount: Schema.Number,
        owner: Entity.ref(Hand.User),
        reviewer: Schema.NullOr(Entity.ref(Hand.User)),
        comments: Schema.Array(Entity.ref(HandComment)),
        parent: Schema.NullOr(Entity.refTo('Project')),
      }),
    )
    const HandUser = Selection.make(Hand.User, { id: true, name: true })
    const hand = Selection.make(HandProject, {
      name: true,
      commentCount: true,
      owner: HandUser,
      reviewer: HandUser,
      comments: Selection.make(HandComment, { body: true, author: HandUser }),
      parent: true,
    })

    expect(selection.entity).toBe(hand.entity)
    expect(selection.fields).toEqual(hand.fields)
    expect(selection.relations).toEqual(hand.relations)
  })

  it('reads through Remote’s store into the value the Entity Selection describes', () => {
    const projection = Remote.select(AppRemote, selection)('p1')

    expect(requirementsOf(projection)).toEqual([
      {
        entity: 'Project',
        id: 'p1',
        fields: ['name', 'commentCount', 'owner', 'reviewer', 'comments', 'parent'],
        relations: {
          owner: { entity: 'User', fields: ['id', 'name'] },
          reviewer: { entity: 'User', fields: ['id', 'name'] },
          comments: {
            entity: 'Comment',
            fields: ['body', 'author'],
            relations: { author: { entity: 'User', fields: ['id', 'name'] } },
          },
        },
      },
    ])

    const read = projection.read(root(fullStore()))
    const value = {
      name: 'Apollo',
      commentCount: 1,
      owner: { id: 'u1', name: 'ada' },
      reviewer: null,
      comments: [{ body: 'hi', author: { id: 'u2', name: 'grace' } }],
      parent: { entity: 'Project', id: 'p0' },
    }
    expect(read).toEqual({ _tag: 'Ready', value })
    // The value Remote assembled is one the Entity Selection's own schema accepts.
    expect(Schema.is(ProjectCard.schema)(value)).toBe(true)
  })

  it('is not ready while a nested target is missing', () => {
    const projection = Remote.select(AppRemote, selection)('p1')
    expect(projection.read(root(emptyStore))).toEqual({ _tag: 'Initial' })
    expect(projection.read(root(storeWith([['u1', 'ada']])))).toEqual({ _tag: 'Initial' })
  })
})

describe('a domain that registers Entities directly', () => {
  const Projects = Query.make('Projects', {
    Input: Schema.Struct({}),
    Result: Query.connection(Work.Project),
  })
  const Direct = Remote.make({
    model: App.model.remote,
    entities: Object.values(Work),
    queries: [Projects],
  })

  it('registers the descriptor Entity.from gives', () => {
    expect([...Direct.registry.entities.keys()]).toEqual(['User', 'Comment', 'Project'])
    expect(Direct.registry.entities.get('Project')).toBe(Entity.from(Work.Project))
  })

  it('reads an Entity Selection as it reads the Remote Selection made from it', () => {
    const direct = Direct.get(ProjectCard, 'p1')
    const adapted = Direct.get(Selection.from(ProjectCard), 'p1')

    expect(requirementsOf(direct)).toEqual(requirementsOf(adapted))
    expect(direct.read(root(fullStore()))).toEqual(adapted.read(root(fullStore())))
    expect(requirementsOf(Direct.live(ProjectCard, 'p1'))[0]?.live).toBe(true)
  })

  it('selects a query page with an Entity Selection', () => {
    const page = Direct.query(Projects, {}, { select: UserSummaryOfProject, first: 10 })
    expect(page.read(root(emptyStore))._tag).toBe('Initial')
  })

  it('refuses a Selection of an Entity the domain does not register', () => {
    const Stranger = Domain.define('Stranger', Schema.Struct({ id: Schema.String }))
    const get = Direct.get as (selection: unknown, id: string) => unknown
    expect(() => get(Domain.select(Stranger, { id: true }), 's1')).toThrow(
      'Entity "Stranger" is not registered',
    )
  })
})

describe('Selection.from an Entity page', () => {
  const CommentLine = Domain.select(Work.Comment, { body: true, author: UserSummary })
  const Paged = Domain.select(Work.Project, {
    name: true,
    comments: Domain.page(CommentLine, { first: 1 }),
  })
  const projection = Remote.select(AppRemote, Selection.from(Paged))('p1')

  it('is the relation connection a hand-written Remote Selection would state', () => {
    expect(requirementsOf(projection)).toEqual([
      {
        entity: 'Project',
        id: 'p1',
        // A page of a whole list is read under a name of its own.
        fields: ['name', 'comments@first=1'],
        windows: { 'comments@first=1': { first: 1 } },
        relations: {
          'comments@first=1': {
            entity: 'Comment',
            fields: ['body', 'author'],
            relations: { author: { entity: 'User', fields: ['id', 'name'] } },
          },
        },
      },
    ])
  })

  it('reads the page the store holds into the value the Entity Selection describes', () => {
    const store = writeEntity(fullStore(), entityKey('Project', 'p1'), {
      'comments@first=1': { refs: ['Comment:c1'], hasNext: true, hasPrevious: false },
    })
    const read = projection.read(root(store))
    const value = {
      name: 'Apollo',
      comments: {
        items: [{ body: 'hi', author: { id: 'u2', name: 'grace' } }],
        hasNext: true,
        hasPrevious: false,
      },
    }
    expect(read).toEqual({ _tag: 'Ready', value })
    expect(Schema.is(Paged.schema)(value)).toBe(true)
  })

  it('holds the whole list and a page of it side by side', () => {
    // fullStore has `comments` whole; the page is written beside it.
    const store = writeEntity(fullStore(), entityKey('Project', 'p1'), {
      'comments@first=1': { refs: ['Comment:c1'], hasNext: true, hasPrevious: false },
    })
    const whole = Remote.select(AppRemote, Selection.from(ProjectCard))('p1').read(root(store))
    const paged = projection.read(root(store))
    expect(whole._tag === 'Ready' && whole.value.comments).toEqual([
      { body: 'hi', author: { id: 'u2', name: 'grace' } },
    ])
    expect(paged._tag === 'Ready' && paged.value.comments.hasNext).toBe(true)
  })

  it('makes a page stale when the whole list is written, so it is read again', () => {
    const paged = writeEntity(fullStore(), entityKey('Project', 'p1'), {
      'comments@first=1': { refs: ['Comment:c1'], hasNext: false, hasPrevious: false },
    })
    expect(missingFields(paged, entityKey('Project', 'p1'), ['comments@first=1'])).toEqual([])
    // A mutation's patch, or a live change, writes the list: a comment was added.
    const patched = writeEntity(paged, entityKey('Project', 'p1'), {
      comments: ['Comment:c1', 'Comment:c2'],
    })
    expect(missingFields(patched, entityKey('Project', 'p1'), ['comments@first=1'])).toEqual([
      'comments@first=1',
    ])
    // The page still reads, as refreshing, until the new one arrives.
    expect(projection.read(root(patched))._tag).toBe('Refreshing')
  })
})

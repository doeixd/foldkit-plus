/**
 * `Data.why`: what a read shows, in words, and for `Initial`, which mistake.
 *
 * `Initial` means nothing is fetching the read. In the first hour with Remote
 * that is almost always wiring: the Surface that reads it is not active, or it
 * is and Remote's Subscriptions were never installed. Both look identical on
 * screen. Given the active record, the Model can tell them apart.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Order, Relation } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote } from '../src/index.js'

const Project = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
)
const All = Query.define('All', {}, () =>
  Query.from(Project).pipe(Query.orderBy(Order.asc(Project.fields.id))),
)

const Model = Schema.Struct({ remote: Remote.Model, open: Schema.NullOr(Schema.String) })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Project], queries: [All] })

const card = Entity.select(Project, { name: true, status: true })
const project = Data.get(card, 'p1')
const list = Data.query(All, {}, { select: card, first: 25 })

const Page = App.surface('ProjectPage', {
  params: { projectId: Schema.String },
  model: ({ params }) => ({ project: Data.get(card, params.projectId) }),
})
const Title = App.surface('ProjectTitle', {
  params: { projectId: Schema.String },
  model: ({ params }) => ({
    name: Data.get(Entity.select(Project, { name: true }), params.projectId),
  }),
})
const Listing = App.surface('ProjectList', { model: () => ({ list }) })

const surfaces = {
  page: Surface.at(Page, (model: Model) =>
    model.open === null ? undefined : { projectId: model.open },
  ),
  title: Surface.at(Title, (model: Model) =>
    model.open === null ? undefined : { projectId: model.open },
  ),
}

const closed: Model = { remote: Remote.initial, open: null }
const open: Model = { ...closed, open: 'p1' }

describe('Data.why for a read that is Initial', () => {
  it('says it cannot tell without the active record', () => {
    expect(Data.why(open, project)).toMatchObject({ state: 'Initial', reason: 'Unknown' })
  })

  it('says no active Surface reads it while the page is closed', () => {
    const why = Data.why(closed, project, { surfaces })

    expect(why).toMatchObject({ state: 'Initial', reason: 'NotObserved', surfaces: [] })
    expect(why.message).toContain('No active Surface reads it')
  })

  it('names the Surface that reads it, and blames the missing Subscriptions', () => {
    const why = Data.why(open, project, { surfaces })

    expect(why).toMatchObject({
      state: 'Initial',
      reason: 'NotFetching',
      surfaces: ['ProjectPage'],
    })
    expect(why.message).toContain('Data.subscriptions')
  })

  it('does not count a Surface that reads only some of it', () => {
    // ProjectTitle reads `name` of p1 and not `status`, so it cannot be why
    // the whole card would be fetched.
    expect(Data.why(open, project, { surfaces }).surfaces).not.toContain('ProjectTitle')
  })

  it('matches a list by its connection', () => {
    expect(Data.why(open, list, { surfaces }).reason).toBe('NotObserved')

    // A Surface with no params is active whenever it is in the record.
    const shown = { ...surfaces, listing: Surface.at(Listing, undefined) }

    expect(Data.why(open, list, { surfaces: shown })).toMatchObject({
      reason: 'NotFetching',
      surfaces: ['ProjectList'],
    })
  })
})

describe('Data.why counts only a Surface that asks for all of the read', () => {
  const UserBase = Entity.define(
    'User',
    Schema.Struct({ id: Schema.String, name: Schema.String, email: Schema.String }),
  )
  const TaskBase = Entity.define('Task', Schema.Struct({ id: Schema.String, title: Schema.String }))
  const { User, Task } = Entity.relate(
    { User: UserBase, Task: TaskBase },
    { Task: { owner: Relation.one(UserBase) } },
  )
  const Tasks = Query.define('Tasks', {}, () =>
    Query.from(Task).pipe(Query.orderBy(Order.asc(Task.fields.id))),
  )
  const Work = Remote.make({ model: App.model.remote, entities: [User, Task], queries: [Tasks] })

  const ownerWith = (fields: { readonly name: true; readonly email?: true }) =>
    Entity.select(Task, { owner: Entity.select(User, fields) })
  const full = Work.get(ownerWith({ name: true, email: true }), 't1')

  it('not one reading fewer fields of a related entity', () => {
    const Names = App.surface('OwnerName', {
      model: () => ({ task: Work.get(ownerWith({ name: true }), 't1') }),
    })

    expect(Work.why(open, full, { surfaces: { one: Surface.at(Names, undefined) } }).reason).toBe(
      'NotObserved',
    )
  })

  it('but one asking for the same read in two pieces', () => {
    const Both = App.surface('OwnerBoth', {
      model: () => ({
        name: Work.get(ownerWith({ name: true }), 't1'),
        email: Work.get(Entity.select(Task, { owner: Entity.select(User, { email: true }) }), 't1'),
      }),
    })

    expect(Work.why(open, full, { surfaces: { one: Surface.at(Both, undefined) } }).reason).toBe(
      'NotFetching',
    )
  })

  it('not one reading a list for fewer fields of its rows', () => {
    const wide = Work.query(
      Tasks,
      {},
      { select: Entity.select(Task, { id: true, title: true }), first: 5 },
    )
    const Narrow = App.surface('TaskIds', {
      model: () => ({
        list: Work.query(Tasks, {}, { select: Entity.select(Task, { id: true }), first: 5 }),
      }),
    })
    const Same = App.surface('TaskTitles', { model: () => ({ list: wide }) })

    expect(Work.why(open, wide, { surfaces: { one: Surface.at(Narrow, undefined) } }).reason).toBe(
      'NotObserved',
    )
    expect(Work.why(open, wide, { surfaces: { one: Surface.at(Same, undefined) } }).reason).toBe(
      'NotFetching',
    )
  })
})

describe('Data.why for a read that is not Initial', () => {
  it('says a request is in flight', () => {
    const loading = Data.reduce(open, {
      _tag: 'ReadStarted',
      requests: [{ entity: 'Project', id: 'p1', fields: ['name', 'status'] }],
    })

    expect(Data.why(loading, project)).toEqual({
      state: 'Loading',
      message: 'A request for it is in flight.',
    })
  })

  it('says a request failed, and that nothing retries it on its own', () => {
    const failed = Data.reduce(open, {
      _tag: 'ReadFailed',
      requests: [{ entity: 'Project', id: 'p1', fields: ['name', 'status'] }],
      error: { _tag: 'RemoteReadError', message: 'offline' },
    })

    expect(Data.why(failed, project).message).toBe(
      'Its request failed: offline. Nothing retries a failed read on its own; Data.refresh asks again.',
    )
  })
})

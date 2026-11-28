import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Order, Relation } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { impactOn, rejudged } from '../src/impact.js'
import { Query, Remote, terminal, type NormalizedPatch } from '../src/index.js'
import { Answers } from './answers.js'

vi.mock(import('../src/impact.js'), async original => {
  const impact = await original()
  return { ...impact, impactOn: vi.fn(impact.impactOn), rejudged: vi.fn(impact.rejudged) }
})

const AuthorFields = Entity.define(
  'Author',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    active: Schema.Boolean,
  }),
)

const TaskFields = Entity.define(
  'Task',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    status: Schema.String,
    priority: Schema.Int,
    note: Schema.String,
  }),
)

const { Task, Author } = Entity.relate(
  { Task: TaskFields, Author: AuthorFields },
  { Task: { author: Relation.one(AuthorFields) } },
)

const OpenTasks = Query.define('OpenTasks', {}, () =>
  Query.from(Task).pipe(
    Query.where(Expr.eq(Task.fields.status, 'open')),
    Query.orderBy(Order.asc(Task.fields.priority)),
  ),
)

const ActiveAuthorTasks = Query.define('ActiveAuthorTasks', {}, () =>
  Query.from(Task).pipe(
    Query.where(Expr.eq(Expr.path(Task.relations.author, Author.fields.active), true)),
    Query.orderBy(Order.asc(Task.fields.title)),
  ),
)

const OpaqueTasks = Query.make('OpaqueTasks', { Input: {}, Result: Task })

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Task, Author],
  queries: [OpenTasks, ActiveAuthorTasks, OpaqueTasks],
  mutations: [Answers],
})

const open = OpenTasks.ref({}).identity
const active = ActiveAuthorTasks.ref({}).identity
const opaque = OpaqueTasks.ref({}).identity
const task = { entity: 'Task', id: 't1' }
const author = { entity: 'Author', id: 'a1' }

const loaded = (identities: ReadonlyArray<string> = [open, active]): Model => {
  const rows: ReadonlyArray<NormalizedPatch> = [
    {
      ...task,
      values: { title: 'Read', status: 'open', priority: 1, note: 'old', author: 'Author:a1' },
    },
    { ...author, values: { name: 'Ada', active: true } },
  ]
  return identities.reduce(
    (model, identity) =>
      Data.reduce(model, {
        _tag: 'ConnectionMerged',
        connection: identity,
        page: { edges: [{ key: 'Task:t1', ref: task }], start: terminal, end: terminal },
      }),
    Data.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ReadReceived',
        requests: rows.map(({ entity, id, values }) => ({
          entity,
          id,
          fields: Object.keys(values),
        })),
        result: { entities: [...rows], settled: [] },
        now: 0,
      },
    ),
  )
}

const answer = (model: Model, ...entities: NormalizedPatch[]) =>
  Data.reduce(model, { _tag: 'MutationSucceeded', requestId: 'r1', entities, now: 1 })

const impactNames = () => vi.mocked(impactOn).mock.calls.map(([query]) => query.descriptor.name)
const rejudgedNames = () => vi.mocked(rejudged).mock.calls.map(([query]) => query.descriptor.name)

beforeEach(() => vi.clearAllMocks())

describe('mutation answers visit the held queries their changed fields reach', () => {
  it('judges zero connections for unread fields', () => {
    const model = loaded()
    const changed = answer(
      model,
      { ...task, values: { note: 'new' } },
      { ...author, values: { name: 'Grace' } },
    )
    expect(Data.storeOf(changed)['Task:t1']?.values['note']).toBe('new')
    expect(changed.remote.connections).toBe(model.remote.connections)
    expect(impactNames()).toEqual([])
    expect(rejudgedNames()).toEqual([])
  })

  it('applies a direct membership change and rejudges a different query for a related change', () => {
    const model = loaded()
    const changed = answer(
      model,
      { ...task, values: { status: 'closed' } },
      { ...author, values: { active: false } },
    )
    expect(impactNames()).toEqual(['OpenTasks', 'ActiveAuthorTasks'])
    expect(rejudgedNames()).toEqual(['ActiveAuthorTasks'])
    expect(Data.visibleItems(changed.remote, open)).toEqual([])
    expect(changed.remote.connections[active]?.stale).toBe(true)
  })

  it('invalidates a connection whose query delegates to the server', () => {
    const model = loaded([open, opaque])
    const changed = answer(model, { ...author, values: { name: 'Grace' } })
    expect(impactNames()).toEqual(['OpaqueTasks'])
    expect(changed.remote.connections[opaque]?.stale).toBe(true)
    expect(changed.remote.connections[open]).toBe(model.remote.connections[open])
  })
})

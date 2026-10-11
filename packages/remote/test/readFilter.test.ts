/**
 * A list over an Entity whose server filters rows by a rule the client does
 * not run (guard-DESIGN §7a, rule 2): a row the list does not hold that
 * changes a member the rule reads is fetched, never placed.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order, ReadFilter } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, type NormalizedPatch } from '../src/index.js'

const TaskFields = DomainEntity.define(
  'Task',
  Schema.Struct({ id: Schema.String, ownerId: Schema.String, status: Schema.String }),
)
// The server reads `ownerId` to decide who may read a task.
const Task = TaskFields.pipe(DomainEntity.annotate(ReadFilter.of(['ownerId'])))

// Declared over the Entity before the rule was attached: the registry still knows.
const Open = Query.define('Open', {}, () =>
  Query.from(TaskFields).pipe(
    Query.where(Expr.eq(TaskFields.fields.status, 'open')),
    Query.orderBy(Order.asc(TaskFields.fields.id)),
  ),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Task], queries: [Open] })
const open = Data.query(Open, {}, { select: DomainEntity.select(Task, { id: true }), first: 25 })

const rows = [
  { id: 't1', ownerId: 'ada', status: 'open' },
  { id: 't2', ownerId: 'grace', status: 'open' },
]

const loaded = (): Model => {
  const stored = Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ReadReceived',
      requests: rows.map(row => ({ entity: 'Task', id: row.id, fields: Object.keys(row) })),
      result: {
        settled: [],
        entities: rows.map(row => ({ entity: 'Task', id: row.id, values: row })),
      },
      now: 0,
    },
  )
  // The server listed only ada's task to ada.
  return Data.reduce(stored, {
    _tag: 'ConnectionMerged',
    connection: open.ref.identity,
    page: {
      edges: [{ key: 'Task:t1', ref: { entity: 'Task', id: 't1' } }],
      start: { _tag: 'Terminal' },
      end: { _tag: 'Terminal' },
    },
  })
}

let sequence = 0
const answered = (model: Model, entities: ReadonlyArray<NormalizedPatch>): Model =>
  Data.reduce(model, {
    _tag: 'MutationSucceeded',
    requestId: `m${++sequence}`,
    entities: [...entities],
    deleted: [],
    now: 1,
  })

const task = (id: string, values: Record<string, unknown>): NormalizedPatch => ({
  entity: 'Task',
  id,
  values,
})

const stale = (model: Model) => model.remote.connections[open.ref.identity]?.stale === true

describe('a list over an Entity its server filters by a rule', () => {
  it('is fetched when a row it does not hold changes a member the rule reads', () => {
    // t2 matches the body; whether ada may now read it only the server knows.
    expect(stale(answered(loaded(), [task('t2', { ownerId: 'ada' })]))).toBe(true)
  })

  it('is judged by its body for a row it holds, and for any other member', () => {
    const base = loaded()
    expect(stale(answered(base, [task('t1', { ownerId: 'grace' })]))).toBe(false)
    expect(stale(answered(base, [task('t2', { status: 'closed' })]))).toBe(false)
  })

  it('is gathered per Entity name when the domain is defined', () => {
    expect(Data.registry.filtered.get('Task')).toEqual(['ownerId'])
  })
})

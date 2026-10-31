/**
 * `Trace`: the application's `update` and Remote's real Subscriptions, run
 * over scripted Messages, with every request held until a step answers it.
 */
import { Clock, Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Entity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  ConnectionChange,
  Mutation,
  Query,
  Remote,
  RemoteClient,
  RemoteQueryError,
  emptyStore,
  isRemoteMessage,
  terminal,
  writeEntities,
} from '../src/index.js'
import { Why } from '../src/why.js'
import { Respond, Trace } from '../src/testing.js'

const Project = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
)
const Open = Query.define('Open', {}, () =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.status, 'open')),
    Query.orderBy(Order.asc(Project.fields.id)),
  ),
)
const Create = Mutation.make('Create', {
  Input: { id: Schema.String, name: Schema.String },
  Output: { id: Schema.String },
})

const Model = Schema.Struct({ remote: Remote.Model, shown: Schema.Boolean })
type Model = typeof Model.Type
const own = {
  Opened: {},
  Closed: {},
  Created: { id: Schema.String, name: Schema.String },
  Pinged: {},
}
const Message = defineMessageUnion({ ...Remote.messages, ...own })
type Message = typeof Message.Type
const Own = defineMessageUnion(own)
const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [Open],
  mutations: [Create],
  // The fake server answers a create with its own name and fewer fields, and
  // orders nothing, to show what a trace sees then.
  verifyPredictions: {
    on: true,
    expected: {
      mutations: {
        Create: {
          Value: 'the fake server names a row by the time it was made',
          Gap: 'the fake server answers some fields of a create alone',
        },
      },
      queries: { Open: { Placement: 'the fake server lists rows in no order' } },
    },
  },
})

const card = Entity.select(Project, { name: true })
const list = Data.query(Open, {}, { select: card, first: 25 })
const active = {
  list: Data.active('list', (model: Model) => (model.shown ? Option.some(list) : Option.none())),
}

const Ping = { name: 'Ping', effect: Effect.succeed(Message.Pinged()) }

const update = (model: Model, message: Message): Update.Return<Model, Message, RemoteClient> => {
  if (isRemoteMessage(message)) return { model: Data.reduce(model, message) }
  return Own.match(message, {
    Opened: () => ({ model: modifyFields(model, { shown: () => true }), commands: [Ping] }),
    Closed: () => ({ model: modifyFields(model, { shown: () => false }) }),
    Created: input => {
      const started = Data.mutate(model, Create, input, {
        optimistic: [
          { entity: 'Project', id: input.id, values: { name: input.name, status: 'open' } },
          ConnectionChange.prepend(list.ref, { entity: 'Project', id: input.id }),
        ],
      })
      return { model: started.model, commands: [started.command] }
    },
    Pinged: () => ({ model }),
  })
}

/** A row's fields as the server holds them, `fields` of them. */
const valuesOf = (id: string, name: string, fields: ReadonlyArray<string>) => {
  const row: Readonly<Record<string, string>> = { id, name, status: 'open' }
  return Object.fromEntries(
    fields.filter(field => Object.hasOwn(row, field)).map(field => [field, row[field]]),
  )
}

/**
 * A server holding open projects, by id, with their names. A mutation's
 * answer carries `answered` of the row it wrote.
 */
const server = (
  rows: Record<string, string>,
  answered: ReadonlyArray<string> = ['id', 'name', 'status'],
): RemoteClient['Service'] => ({
  read: batch =>
    Effect.succeed({
      settled: [],
      entities: batch.requests.flatMap(request =>
        Object.hasOwn(rows, request.id)
          ? [
              {
                entity: request.entity,
                id: request.id,
                values: valuesOf(request.id, rows[request.id]!, request.fields),
              },
            ]
          : [],
      ),
    }),
  query: request =>
    Effect.succeed({
      edges: Object.keys(rows)
        .sort()
        .map(id => ({ entity: 'Project', id, key: `Project:${id}` })),
      start: terminal,
      end: terminal,
      entities: Object.entries(rows).map(([id, name]) => ({
        entity: 'Project',
        id,
        values: valuesOf(id, name, request.select?.fields ?? []),
      })),
    }),
  mutate: request => {
    const { id, name } = Schema.decodeUnknownSync(Create.Input)(request.input)
    rows[id] = name
    return Effect.succeed({
      output: { id },
      entities: [{ entity: 'Project', id, values: valuesOf(id, name, answered) }],
    })
  },
  live: () => Stream.empty,
})

const closed: Model = { remote: Remote.initial, shown: false }
const opened: Model = { ...closed, shown: true }

/** The list shown and loaded with p1. */
const loaded = async () => {
  const trace = await Trace.run(Data, {
    start: opened,
    update,
    active,
    client: server({ p1: 'One' }),
    steps: [Respond.all],
  })
  return trace.entries.at(-1)!.model
}

describe('Trace.run', () => {
  it('starts the Subscriptions at the start Model, and a step answers what they asked', async () => {
    const trace = await Trace.run(Data, {
      start: opened,
      update,
      active,
      client: server({ p1: 'One' }),
      steps: [Respond.query(list.ref)],
    })

    expect(Trace.tags(trace, list)).toEqual(['Initial', 'Loading', 'Ready'])
    expect(trace.entries.map(entry => [entry.step, entry.message._tag])).toEqual([
      [0, 'QueryStarted'],
      [0, 'RetentionChanged'],
      [1, 'ConnectionMerged'],
    ])
    expect(list.read(trace.entries.at(-1)!.model)).toMatchObject({
      _tag: 'Ready',
      value: { items: [{ name: 'One' }] },
    })
  })

  it('holds a request until a step answers it', async () => {
    const trace = await Trace.run(Data, {
      start: opened,
      update,
      active,
      client: server({ p1: 'One' }),
      steps: [],
    })

    expect(Trace.tags(trace, list)).toEqual(['Initial', 'Loading'])
    expect(trace.pending).toEqual(['query Open {}'])
  })

  it('runs Remote’s Commands and records the others it skipped', async () => {
    const trace = await Trace.run(Data, {
      start: await loaded(),
      update,
      active,
      client: server({ p1: 'One' }),
      steps: [Message.Opened(), Message.Created({ id: 'p2', name: 'Two' })],
    })

    expect(
      trace.entries
        .filter(entry => entry.step > 0)
        .map(entry => [entry.message._tag, entry.skipped]),
    ).toEqual([
      ['Opened', ['Ping']],
      ['Created', []],
    ])
    // p2 is read once its create is answered: the server has nothing of it before.
    expect(trace.pending).toEqual(['mutation Create'])
  })

  it('stands its clock at `now`, for the answers it asks for and the Commands it runs', async () => {
    // A server that names the row by the time it reads.
    const clocked: RemoteClient['Service'] = {
      ...server({}),
      mutate: () =>
        Effect.map(Clock.currentTimeMillis, at => ({
          output: { id: 'p2' },
          entities: [{ entity: 'Project', id: 'p2', values: { name: `at ${at}` } }],
        })),
    }
    const trace = await Trace.run(Data, {
      start: closed,
      update,
      active,
      client: clocked,
      now: 7_000,
      steps: [Message.Created({ id: 'p2', name: 'Two' }), Respond.mutation(Create)],
    })
    expect(trace.entries.at(-1)!.message).toMatchObject({
      _tag: 'MutationSucceeded',
      entities: [{ values: { name: 'at 7000' } }],
      now: 7_000,
    })
  })

  it('answers, with Respond.all, what the answers lead to', async () => {
    // A page without its rows' fields: the rows are read after it lands.
    const rows = server({ p1: 'One' })
    const trace = await Trace.run(Data, {
      start: opened,
      update,
      active,
      client: { ...rows, query: ({ select: _, ...request }) => rows.query(request) },
      steps: [Respond.all],
    })

    expect(
      trace.entries.filter(entry => entry.step === 1).map(entry => entry.message._tag),
    ).toEqual(['ConnectionMerged', 'ReadStarted', 'ReadReceived'])
    expect(Trace.tags(trace, list).at(-1)).toBe('Ready')
    expect(trace.pending).toEqual([])
  })

  it('answers with the failure a step names', async () => {
    const trace = await Trace.run(Data, {
      start: await loaded(),
      update,
      active,
      client: server({ p1: 'One' }),
      steps: [
        Message.ConnectionInvalidated({ connection: list.ref.identity }),
        Respond.query(list.ref, { fail: new RemoteQueryError({ message: 'down' }) }),
      ],
    })

    expect(Trace.tags(trace, list)).toEqual(['Ready', 'Refreshing', 'Failed'])
    expect(Trace.regressions(trace, { list })).toEqual([])
  })

  it('drops a request whose stream restarted, as the runtime does', async () => {
    const run = Trace.run(Data, {
      start: opened,
      update,
      active,
      client: server({}),
      steps: [Message.Closed(), Respond.query(list.ref)],
    })

    await expect(run).rejects.toThrow(
      'Trace: step 2, Respond.query(Open), answers nothing: no such request is held. Held: none',
    )
  })

  it('fails loudly when a Subscription dies', async () => {
    const run = Trace.run(Data, {
      start: opened,
      update,
      active,
      client: { ...server({}), query: () => Effect.die('the server fell over') },
      steps: [Respond.query(list.ref)],
    })

    await expect(run).rejects.toThrow('Trace: a Subscription or Command died at step 1')
  })
})

describe('Trace.regressions', () => {
  it('names a read that stopped showing its value, with the Message and why', async () => {
    const trace = await Trace.run(Data, {
      start: await loaded(),
      update,
      active,
      client: server({ p1: 'One' }),
      steps: [
        Message.Hydrated({
          entities: writeEntities(emptyStore, [{ key: 'Project:p1', values: { status: 'open' } }]),
          merge: 'replace',
        }),
      ],
    })

    expect(Trace.regressions(trace, { list })).toEqual([
      {
        read: 'list',
        step: 1,
        message: expect.objectContaining({ _tag: 'Hydrated' }),
        from: 'Ready',
        to: 'Initial',
        // The replace dropped the row's fields, and the read entry has not asked yet.
        why: expect.objectContaining({
          because: [
            Why.NotFetching({ surfaces: ['list'] }),
            Why.Fields({
              row: { entity: 'Project', id: 'p1' },
              via: [],
              fields: ['name', 'id'],
              held: 'Missing',
              inFlight: false,
            }),
          ],
        }),
      },
    ])
  })

  it('finds none where the server says the row is gone', async () => {
    // A domain of its own: the readers a trace names stay with its domain.
    const Reads = Remote.make({
      model: App.model.remote,
      entities: [Project],
      verifyPredictions: true,
    })
    const project = Reads.get(card, 'p1')
    const trace = await Trace.run(Reads, {
      start: closed,
      update: (model: Model, message: Message) => {
        if (isRemoteMessage(message)) return { model: Reads.reduce(model, message) }
        return { model }
      },
      active: { project: Reads.active('project', () => Option.some(project)) },
      client: server({ p1: 'One' }),
      steps: [
        Respond.read(Project, 'p1'),
        Message.ReadReceived({
          requests: [{ entity: 'Project', id: 'p1', fields: ['name'] }],
          result: { entities: [], settled: [] },
          now: 0,
        }),
      ],
    })

    expect(Trace.tags(trace, project)).toEqual(['Initial', 'Loading', 'Ready', 'NotFound'])
    expect(Trace.regressions(trace, { project })).toEqual([])
  })

  it('finds none where a value stays on screen', async () => {
    const trace = await Trace.run(Data, {
      start: await loaded(),
      update,
      active,
      client: server({ p1: 'One' }),
      steps: [Message.Closed(), Message.Opened(), Respond.query(list.ref)],
    })

    expect(Trace.tags(trace, list)).toEqual(['Ready', 'Refreshing', 'Ready'])
    expect(Trace.regressions(trace, { list })).toEqual([])
  })
})

describe('A created row, answered without a field the list reads (#243)', () => {
  // The answer carries no `name`, so once the optimistic layer goes, the row
  // waits on a read of it. The list keeps what it shows meanwhile.
  const created = Message.Created({ id: 'p2', name: 'Two' })
  const refresh = Message.ConnectionInvalidated({ connection: list.ref.identity })
  const orders = [
    {
      name: 'the answer, then the read',
      steps: [created, Respond.mutation(Create), Respond.read(Project, 'p2')],
      tags: ['Ready', 'Refreshing', 'Ready'],
    },
    {
      name: 'a refresh in flight, the answer, then the page',
      steps: [refresh, created, Respond.mutation(Create), Respond.query(list.ref), Respond.all],
      tags: ['Ready', 'Refreshing', 'Ready'],
    },
    {
      name: 'a refresh in flight, the page, then the answer',
      steps: [refresh, created, Respond.query(list.ref), Respond.mutation(Create), Respond.all],
      tags: ['Ready', 'Refreshing', 'Ready', 'Refreshing', 'Ready'],
    },
  ]

  it.each(orders)('never blinks to Loading: $name', async ({ steps, tags }) => {
    const trace = await Trace.run(Data, {
      start: await loaded(),
      update,
      active,
      client: server({ p1: 'One' }, ['id', 'status']),
      steps,
    })

    expect(Trace.tags(trace, list)).toEqual(tags)
    expect(Trace.regressions(trace, { list })).toEqual([])
    expect(list.read(trace.entries.at(-1)!.model)).toMatchObject({
      _tag: 'Ready',
      value: { items: [{ name: 'One' }, { name: 'Two' }] },
    })
  })
})

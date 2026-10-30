/**
 * A disagreement between what the client predicted and what it then showed
 * fails a test by default (#350): `Trace.run` and `Trace.record` throw on a
 * `PredictionMismatch` the reducer recorded and on a read that regressed,
 * unless the domain declares the part expected or the test the regression.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Entity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  ConnectionChange,
  emptyStore,
  Mutation,
  Query,
  Remote,
  isRemoteMessage,
  terminal,
  writeEntities,
  type RemoteClient,
  type VerifyPredictions,
} from '../src/index.js'
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

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const own = { Created: { id: Schema.String, name: Schema.String } }
const Message = defineMessageUnion({ ...Remote.messages, ...own })
type Message = typeof Message.Type
const Own = defineMessageUnion(own)
const App = Surface.application({ Model, Message })

const make = (verifyPredictions: boolean | VerifyPredictions<'Create', 'Open'>) =>
  Remote.make({
    model: App.model.remote,
    entities: [Project],
    queries: [Open],
    mutations: [Create],
    verifyPredictions,
  })
type Domain = ReturnType<typeof make>

/** The application over `Data`: the open list shown, and a create that joins it. */
const appOf = (Data: Domain) => {
  const list = Data.query(Open, {}, { select: Entity.select(Project, { name: true }), first: 25 })
  const active = { list: Data.active('list', () => Option.some(list)) }
  const update = (model: Model, message: Message): Update.Return<Model, Message, RemoteClient> =>
    isRemoteMessage(message)
      ? { model: Data.reduce(model, message) }
      : Own.match(message, {
          Created: input => {
            const started = Data.mutate(model, Create, input, {
              optimistic: [
                Remote.patch(Project, input.id, { name: input.name, status: 'open' }),
                ConnectionChange.prepend(list.ref, Remote.ref(Project, input.id)),
              ],
            })
            return { model: started.model, commands: [started.command] }
          },
        })
  return { list, active, update }
}

/**
 * A server of open projects. `rename` is what it stores a create's name as,
 * `answered` the fields its answer carries, and `order` how it lists ids.
 */
const server = (
  options: {
    readonly rename?: (name: string) => string
    readonly answered?: ReadonlyArray<string>
    readonly order?: (ids: ReadonlyArray<string>) => ReadonlyArray<string>
  } = {},
): RemoteClient['Service'] => {
  const rows: Record<string, string> = { p3: 'Three' }
  const valuesOf = (id: string, fields: ReadonlyArray<string>) =>
    Object.fromEntries(
      Object.entries({ id, name: rows[id]!, status: 'open' }).filter(([field]) =>
        fields.includes(field),
      ),
    )
  return {
    read: batch =>
      Effect.succeed({
        settled: [],
        entities: batch.requests.map(request => ({
          entity: request.entity,
          id: request.id,
          values: valuesOf(request.id, request.fields),
        })),
      }),
    query: request =>
      Effect.succeed({
        edges: (options.order ?? (ids => ids))(Object.keys(rows).sort()).map(id => ({
          entity: 'Project',
          id,
          key: `Project:${id}`,
        })),
        start: terminal,
        end: terminal,
        entities: Object.keys(rows).map(id => ({
          entity: 'Project',
          id,
          values: valuesOf(id, request.select?.fields ?? []),
        })),
      }),
    mutate: request => {
      const { id, name } = Schema.decodeUnknownSync(Create.Input)(request.input)
      rows[id] = (options.rename ?? (same => same))(name)
      return Effect.succeed({
        output: { id },
        entities: [
          {
            entity: 'Project',
            id,
            values: valuesOf(id, options.answered ?? ['id', 'name', 'status']),
          },
        ],
      })
    },
    live: () => Stream.empty,
  }
}

const start: Model = { remote: Remote.initial }
const created = Message.Created({ id: 'p1', name: 'One' })

/** A trace over `Data`: the list loaded, p1 created, every answer given, unless `steps` says. */
const traced = (
  Data: Domain,
  client: RemoteClient['Service'],
  options: {
    readonly steps?: ReadonlyArray<Message | Respond>
    readonly reads?: boolean
    readonly regresses?: string
  } = {},
) => {
  const app = appOf(Data)
  return Trace.run(Data, {
    start,
    update: app.update,
    active: app.active,
    client,
    steps: options.steps ?? [Respond.all, created, Respond.all],
    ...(options.reads === true ? { reads: { list: app.list } } : {}),
    ...(options.regresses === undefined ? {} : { regresses: { list: options.regresses } }),
  })
}

describe('verifyPredictions.expected', () => {
  it('refuses a mutation or a query the domain does not register', () => {
    expect(() =>
      // @ts-expect-error a mutation of another domain
      make({ on: true, expected: { mutations: { Delete: { Value: 'a reason' } } } }),
    ).toThrow('verifyPredictions.expected.mutations names "Delete"')
    expect(() =>
      // @ts-expect-error a query of another domain
      make({ on: true, expected: { queries: { Closed: { Placement: 'a reason' } } } }),
    ).toThrow('verifyPredictions.expected.queries names "Closed"')
  })

  it('refuses an expected part with no reason', () => {
    expect(() => make({ on: true, expected: { mutations: { Create: { Value: ' ' } } } })).toThrow(
      'verifyPredictions.expected.mutations.Create.Value gives no reason',
    )
  })

  it('verifies only when on, in either form', () => {
    expect(make(true).verifiesPredictions).toBe(true)
    expect(make({ on: true }).verifiesPredictions).toBe(true)
    expect(make(false).verifiesPredictions).toBe(false)
    expect(make({ on: false, expected: {} }).verifiesPredictions).toBe(false)
  })
})

describe('Trace.run', () => {
  it('refuses a domain that does not verify its predictions', async () => {
    await expect(traced(make(false), server({ rename: name => `${name}!` }))).rejects.toThrow(
      'Trace.run: this domain does not verify its predictions',
    )
  })

  it('passes a write the server answers as the client showed it', async () => {
    const trace = await traced(make(true), server())
    expect(trace.pending).toEqual([])
  })

  it('fails on a value the server answers otherwise, with the Message and the words', async () => {
    await expect(traced(make(true), server({ rename: name => `${name}!` }))).rejects.toThrow(
      /disagree, 1 time\(s\)[^]*after MutationSucceeded \(entry \d+\): Create \(request remote-1\) showed Project:p1\.name as "One" while it was pending, and the server answered "One!"/,
    )
  })

  it('passes a value the domain expects the server to answer otherwise', async () => {
    const Data = make({
      on: true,
      expected: { mutations: { Create: { Value: 'the server shouts every name' } } },
    })
    await traced(Data, server({ rename: name => `${name}!` }))
  })

  it('fails on a list the server orders otherwise, and passes it once expected', async () => {
    const reversed = () => server({ order: ids => [...ids].reverse() })
    await expect(traced(make(true), reversed())).rejects.toThrow(
      /The client placed rows in Open\u0000\{\} as \[Project:p1, Project:p3\], and the server's first page lists \[Project:p3, Project:p1\]/,
    )
    await traced(
      make({
        on: true,
        expected: { queries: { Open: { Placement: 'the server lists the newest last' } } },
      }),
      reversed(),
    )
  })

  describe('a read that regresses', () => {
    // The store replaced by one holding only p3's status: the list drops to
    // Initial, its rows unread, with no reason a reader sees.
    const steps = [
      Respond.all,
      Message.Hydrated({
        entities: writeEntities(emptyStore, [{ key: 'Project:p3', values: { status: 'open' } }]),
        merge: 'replace',
      }),
    ]

    it('passes when the test names no reads', async () => {
      await traced(make(true), server(), { steps })
    })

    it('fails when the test names it, with the Message and why', async () => {
      await expect(traced(make(true), server(), { steps, reads: true })).rejects.toThrow(
        /disagree, 1 time\(s\)[^]*after Hydrated \(entry \d+\): list went Ready to Initial: /,
      )
    })

    it('passes when the test says why it regresses', async () => {
      await traced(make(true), server(), {
        steps,
        reads: true,
        regresses: 'a replace forgets on purpose',
      })
    })
  })
})

describe('Trace.record', () => {
  /** The Messages a run of `Data` over `client` handled, in order. */
  const messagesOf = async (Data: Domain, client: RemoteClient['Service']) =>
    (await traced(Data, client)).entries.map(entry => entry.message)

  /** `messages` replayed through a recording of `Data`'s application. */
  const replayed = (Data: Domain, messages: ReadonlyArray<Message>) => {
    const app = appOf(Data)
    // The list loads and stays: a recording that started anywhere but the first Model would not see so.
    const recording = Trace.record(Data, app.update, { reads: { list: app.list } })
    messages.reduce((model, message) => recording.update(model, message).model, start)
    return recording
  }

  // The same Messages, from a domain that expects the server's rename.
  const shouted = () =>
    messagesOf(
      make({ on: true, expected: { mutations: { Create: { Value: 'it shouts' } } } }),
      server({ rename: name => `${name}!` }),
    )

  it('refuses a domain that does not verify its predictions', () => {
    const Data = make(false)
    expect(() => Trace.record(Data, appOf(Data).update)).toThrow(
      'Trace.record: this domain does not verify its predictions',
    )
  })

  it('fails its check on a mismatch the running reducer recorded', async () => {
    const recording = replayed(make(true), await shouted())
    expect(() => recording.check()).toThrow(
      /Trace\.record: [^]*disagree, 1 time\(s\)[^]*Project:p1\.name as "One"/,
    )
  })

  it('passes its check when the domain expects it, or before any Message', async () => {
    const Data = make({ on: true, expected: { mutations: { Create: { Value: 'it shouts' } } } })
    replayed(Data, await shouted()).check()
    Trace.record(make(true), appOf(make(true)).update).check()
  })
})

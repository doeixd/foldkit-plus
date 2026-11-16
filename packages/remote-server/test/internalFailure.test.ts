// @vitest-environment node
/**
 * What a caller learns when the server fails (#573): nothing of what broke.
 * A Source's failure, a thrown error and a defect are answered "Internal
 * error" with the id their cause was reported under, over `answer`, over
 * `serveFetch` and over an `RpcServer` route alike, and each case's canary is
 * nowhere in the bytes sent. Words a Source wrote for its caller
 * (`RemoteServer.tell`, a refusal, a denial) still arrive as written.
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { FetchHttpClient, HttpRouter, HttpServer } from 'effect/http'
import { RpcClient, RpcSerialization, RpcServer } from 'effect/rpc'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Operators, Order } from 'foldkit-entity'
import {
  Diagnostics,
  Mutation,
  Query,
  REMOTE_PROTOCOL_VERSION,
  Refusal,
  Remote,
  RemoteData,
  RemoteRpc,
  terminal,
  type Diagnostic,
} from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { serveFetch } from '../src/fetch.js'
import {
  RemoteServer,
  RemoteServerError,
  type LiveSource,
  type ServerDefinition,
} from '../src/index.js'

const fields = Schema.Struct({ id: Schema.String, body: Schema.String })
const Driver = Entity.define('Driver', fields)
const Thrower = Entity.define('Thrower', fields)
const Guarded = Entity.define('Guarded', fields)
const Told = Entity.define('Told', fields)

const DriverList = Query.make('DriverList', { Input: {}, Result: Query.connection(Driver) })
const ThrowerList = Query.make('ThrowerList', { Input: {}, Result: Query.connection(Thrower) })
const ToldList = Query.make('ToldList', { Input: {}, Result: Query.connection(Told) })
/** A list that runs, whose rows' read then fails. */
const DriverRows = Query.make('DriverRows', { Input: {}, Result: Query.connection(Driver) })

const write = (name: string) => Mutation.make(name, { Input: {}, Output: {} })
const DriverWrite = write('DriverWrite')
const ThrowerWrite = write('ThrowerWrite')
const ToldWrite = Mutation.make('ToldWrite', {
  Input: { note: Schema.optional(Schema.String) },
  Output: {},
})
const ForbiddenWrite = write('ForbiddenWrite')
const BadOutput = Mutation.make('BadOutput', {
  Input: {},
  Output: { text: Schema.String.check(Schema.isMaxLength(3)) },
})
const Refused = Mutation.make('Refused', { Input: {}, Output: {}, Refusal: Refusal.conflict })
const Misrefused = Mutation.make('Misrefused', {
  Input: {},
  Output: {},
  Refusal: Refusal.field('price', Schema.Number),
})

const told = 'That report is still being built'
/** What a driver says of a failed statement: a table, a column, a value. */
const driverFailure = (canary: string) =>
  new RemoteServerError({
    message: `${canary}: SQLITE_CONSTRAINT: UNIQUE constraint failed: users.email`,
    cause: new Error(`${canary}-cause: postgres://admin:hunter2@db.internal/app`),
  })

const live = (entity: string, changes: LiveSource<unknown>['subscribe']): LiveSource<unknown> => ({
  entity,
  subscribe: changes,
})

const custom: ServerDefinition<unknown> = RemoteServer.make({
  entities: [
    RemoteServer.entity(Driver, {
      read: () => Effect.fail(driverFailure('SECRET-CANARY-read-driver')),
    }),
    RemoteServer.entity(Thrower, {
      read: () => {
        throw new Error('SECRET-CANARY-read-throw')
      },
    }),
    RemoteServer.entity(Guarded, {
      authorize: () => {
        throw new Error('SECRET-CANARY-authorize')
      },
      read: () => Effect.succeed([]),
    }),
    RemoteServer.entity(Told, { read: () => Effect.fail(RemoteServer.tell(told)) }),
  ],
  queries: [
    RemoteServer.query(DriverList, () => Effect.fail(driverFailure('SECRET-CANARY-query-driver'))),
    RemoteServer.query(ThrowerList, () => Effect.die(new Error('SECRET-CANARY-query-throw'))),
    RemoteServer.query(ToldList, () => Effect.fail(RemoteServer.tell(told))),
    RemoteServer.query(DriverRows, () =>
      Effect.succeed({
        edges: [{ entity: 'Driver', id: 'a', key: 'Driver:a' }],
        start: terminal,
        end: terminal,
      }),
    ),
  ],
  mutations: [
    RemoteServer.mutation(DriverWrite, () =>
      Effect.fail(driverFailure('SECRET-CANARY-write-driver')),
    ),
    RemoteServer.mutation(ThrowerWrite, () => Effect.die(new Error('SECRET-CANARY-write-throw'))),
    RemoteServer.mutation(ToldWrite, () => Effect.fail(RemoteServer.tell(told))),
    RemoteServer.mutation(ForbiddenWrite, () =>
      Effect.fail(RemoteServer.forbid('Only an editor may')),
    ),
    RemoteServer.mutation(BadOutput, () =>
      Effect.succeed({ output: { text: 'SECRET-CANARY-output' } }),
    ),
    RemoteServer.mutation(Refused, () =>
      Effect.fail(RemoteServer.refuse(Refused, { _tag: 'Conflict' }, 'Someone changed it first')),
    ),
    RemoteServer.mutation(Misrefused, () =>
      Effect.fail(RemoteServer.refuse(Refused, { _tag: 'Conflict' }, 'SECRET-CANARY-refusal')),
    ),
  ],
  live: [
    live('Driver', () => Stream.fail(driverFailure('SECRET-CANARY-live-driver'))),
    live('Thrower', () => Stream.die(new Error('SECRET-CANARY-live-throw'))),
    live('Told', () => Stream.fail(RemoteServer.tell(told))),
  ],
})

const Note = Entity.define('Note', Schema.Struct({ id: Schema.String, body: Schema.String }))
const AllNotes = Query.define('AllNotes', {}, () =>
  Query.from(Note).pipe(Query.orderBy(Order.asc(Note.fields.id))),
)
const flagged = Expr.operator('acme.flagged', { input: [Schema.String], output: Schema.Boolean })
const Flagged = Query.define('Flagged', {}, () =>
  Query.from(Note).pipe(
    Query.where(flagged(Note.fields.body)),
    Query.orderBy(Order.asc(Note.fields.id)),
  ),
)
const App = Surface.application({
  Model: Schema.Struct({ remote: Remote.Model }),
  Message: defineMessageUnion({ ...Remote.messages }),
})
const domain = Remote.make({
  model: App.model.remote,
  entities: [Note],
  queries: [AllNotes, Flagged],
})
/** A memory backend whose `readable` throws for `blind`, and whose operator throws for every row. */
const memory = RemoteServer.memory<string>({
  domain,
  rows: { Note: [{ id: 'a', body: 'x' }] },
  operators: Operators.memory(
    Operators.implement(flagged, () => {
      throw new Error('SECRET-CANARY-operator')
    }),
  ),
  readable: principal =>
    Effect.succeed(() => {
      if (principal === 'blind') throw new Error('SECRET-CANARY-readable')
      return true
    }),
}).server

const readOf = (entity: string) => ({
  operation: 'read' as const,
  payload: {
    version: REMOTE_PROTOCOL_VERSION,
    requests: [{ entity, id: 'a', fields: ['body'] }],
  },
})
const queryOf = (
  query: string,
  window: object = { first: 5 },
  select?: { readonly entity: string; readonly fields: ReadonlyArray<string> },
) => ({
  operation: 'query' as const,
  payload: { query, input: {}, window, ...(select === undefined ? {} : { select }) },
})
const mutateOf = (mutation: string) => ({
  operation: 'mutate' as const,
  payload: { requestId: 'r1', mutation, input: {} },
})
const liveOf = (entity: string) => ({
  operation: 'live' as const,
  payload: {
    version: REMOTE_PROTOCOL_VERSION,
    requirements: [{ entity, id: 'a', fields: ['body'] }],
    after: 0,
  },
})
type Ask =
  | ReturnType<typeof readOf>
  | ReturnType<typeof queryOf>
  | ReturnType<typeof mutateOf>
  | ReturnType<typeof liveOf>

/** What one failed call sent and reported. */
interface Failed {
  /** Every byte answered, as text. */
  readonly sent: string
  readonly message: string
  readonly incident: string | undefined
  readonly reported: ReadonlyArray<Diagnostic>
}

const Incident = Schema.Struct({ incident: Schema.optional(Schema.String) })
const AnswerBody = Schema.Struct({ error: Schema.String, ...Incident.fields })
const Frame = Schema.Struct({ message: Schema.String, ...Incident.fields })

const overAnswer = async <P>(server: ServerDefinition<P>, who: P, ask: Ask): Promise<Failed> => {
  const collected = Diagnostics.collect()
  const answered = await Effect.runPromise(
    RemoteServer.answer(RemoteServer.handlers(server, who), ask).pipe(
      Effect.provideService(Diagnostics.Reporter, collected.report),
    ),
  )
  const body = Schema.decodeUnknownSync(AnswerBody)(answered.body)
  return {
    sent: JSON.stringify(answered.body),
    message: body.error,
    incident: body.incident,
    reported: collected.reported,
  }
}

const overFetch = async <P>(server: ServerDefinition<P>, who: P, ask: Ask): Promise<Failed> => {
  const collected = Diagnostics.collect()
  const response = await serveFetch({
    server,
    resolvePrincipal: () => Effect.succeed(who),
    layer: () => Layer.empty,
    diagnostics: collected.report,
  })(new Request('http://worker.test/remote', { method: 'POST', body: JSON.stringify(ask) }), {})
  const sent = await response.text()
  if (ask.operation !== 'live') {
    const body = Schema.decodeUnknownSync(AnswerBody)(JSON.parse(sent))
    return { sent, message: body.error, incident: body.incident, reported: collected.reported }
  }
  const data = sent.split('\n').find(line => line.startsWith('data: '))
  if (data === undefined) throw new Error(`the live stream ended with no error frame: ${sent}`)
  const frame = Schema.decodeUnknownSync(Frame)(JSON.parse(data.slice('data: '.length)))
  return { sent, ...frame, incident: frame.incident, reported: collected.reported }
}

/** Effect's own RPC endpoint over HTTP: what serialises a cause, where one reaches it. */
const overRpc = async <P>(server: ServerDefinition<P>, who: P, ask: Ask): Promise<Failed> => {
  const collected = Diagnostics.collect()
  const web = HttpRouter.toWebHandler(
    RpcServer.layer(RemoteRpc).pipe(
      Layer.provide(RemoteRpc.toLayer(RemoteServer.handlers(server, who))),
      Layer.provide(Layer.succeed(Diagnostics.Reporter, collected.report)),
      Layer.provide(RpcServer.layerProtocolHttp({ path: '/rpc' })),
      Layer.provide(RpcSerialization.layerJson),
      Layer.provide(HttpServer.layerServices),
    ),
    { disableLogger: true },
  )
  const sent: Array<string> = []
  const viaWeb: typeof fetch = async (input, init) => {
    const response = await web.handler(new Request(String(input), init))
    sent.push(await response.clone().text())
    return response
  }
  try {
    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* RpcClient.make(RemoteRpc)
        return yield* ask.operation === 'read'
          ? Effect.flip(client.FoldkitRemoteRead(ask.payload))
          : ask.operation === 'query'
            ? Effect.flip(client.FoldkitRemoteQuery(ask.payload))
            : ask.operation === 'mutate'
              ? Effect.flip(client.FoldkitRemoteMutate(ask.payload))
              : Effect.flip(Stream.runDrain(client.FoldkitRemoteLive(ask.payload)))
      }).pipe(
        Effect.scoped,
        Effect.provide(
          RpcClient.layerProtocolHttp({ url: 'http://worker.test/rpc' }).pipe(
            Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer]),
            Layer.provide(Layer.succeed(FetchHttpClient.Fetch, viaWeb)),
          ),
        ),
      ),
    )
    return {
      sent: sent.join('\n'),
      message: error.message,
      incident: 'incident' in error ? error.incident : undefined,
      reported: collected.reported,
    }
  } finally {
    await web.dispose()
  }
}

const transports = [
  ['RemoteServer.answer', overAnswer],
  ['serveFetch', overFetch],
  ['an RpcServer route', overRpc],
] as const

/** Each way the server fails on its own side: what is asked, as whom, and what its report names. */
const internal: ReadonlyArray<{
  readonly name: string
  readonly server: ServerDefinition<any>
  readonly who?: string
  readonly ask: Ask
  readonly during: string
  /** What only the cause says, which the report holds and nothing sent does. */
  readonly canary: string
}> = [
  {
    name: 'a Source failing with a driver’s words',
    server: custom,
    ask: readOf('Driver'),
    during: 'read Driver',
    canary: 'SECRET-CANARY-read-driver',
  },
  {
    name: 'a Source that throws',
    server: custom,
    ask: readOf('Thrower'),
    during: 'read Thrower',
    canary: 'SECRET-CANARY-read-throw',
  },
  {
    name: 'an authorize that throws',
    server: custom,
    ask: readOf('Guarded'),
    during: 'read Guarded',
    canary: 'SECRET-CANARY-authorize',
  },
  {
    name: 'a memory read whose readable throws',
    server: memory,
    who: 'blind',
    ask: readOf('Note'),
    during: 'read Note',
    canary: 'SECRET-CANARY-readable',
  },
  {
    name: 'a memory list whose readable throws',
    server: memory,
    who: 'blind',
    ask: queryOf('AllNotes'),
    during: 'query AllNotes',
    canary: 'SECRET-CANARY-readable',
  },
  {
    name: 'a memory list whose operator throws',
    server: memory,
    who: 'ada',
    ask: queryOf('Flagged'),
    during: 'query Flagged',
    canary: 'SECRET-CANARY-operator',
  },
  {
    name: 'a query Source failing with a driver’s words',
    server: custom,
    ask: queryOf('DriverList'),
    during: 'query DriverList',
    canary: 'SECRET-CANARY-query-driver',
  },
  {
    name: 'a list whose rows’ read fails with a driver’s words',
    server: custom,
    ask: queryOf('DriverRows', { first: 5 }, { entity: 'Driver', fields: ['body'] }),
    during: 'read Driver',
    canary: 'SECRET-CANARY-read-driver',
  },
  {
    name: 'a query Source that dies',
    server: custom,
    ask: queryOf('ThrowerList'),
    during: 'query ThrowerList',
    canary: 'SECRET-CANARY-query-throw',
  },
  {
    name: 'a mutation Source failing with a driver’s words',
    server: custom,
    ask: mutateOf('DriverWrite'),
    during: 'mutate DriverWrite',
    canary: 'SECRET-CANARY-write-driver',
  },
  {
    name: 'a mutation Source that dies',
    server: custom,
    ask: mutateOf('ThrowerWrite'),
    during: 'mutate ThrowerWrite',
    canary: 'SECRET-CANARY-write-throw',
  },
  {
    name: 'a mutation whose output its Schema refuses',
    server: custom,
    ask: mutateOf('BadOutput'),
    during: 'mutate BadOutput',
    // A Schema's error names the check, not the value it refused.
    canary: 'a length of at most 3',
  },
  {
    name: 'a mutation refused with another mutation’s refusal',
    server: custom,
    ask: mutateOf('Misrefused'),
    during: 'mutate Misrefused',
    canary: 'SECRET-CANARY-refusal',
  },
  {
    name: 'a live source failing with a driver’s words',
    server: custom,
    ask: liveOf('Driver'),
    during: 'live Driver',
    canary: 'SECRET-CANARY-live-driver',
  },
  {
    name: 'a live source that dies',
    server: custom,
    ask: liveOf('Thrower'),
    during: 'live Thrower',
    canary: 'SECRET-CANARY-live-throw',
  },
]

const tellings: ReadonlyArray<{ readonly name: string; readonly ask: Ask }> = [
  { name: 'a read', ask: readOf('Told') },
  { name: 'a query', ask: queryOf('ToldList') },
  { name: 'a mutation', ask: mutateOf('ToldWrite') },
  { name: 'a live stream', ask: liveOf('Told') },
]

describe.each(transports)('a failure on the server’s side, over %s', (transport, over) => {
  // `answer` speaks no live stream.
  const speaks = (each: { readonly ask: Ask }) =>
    each.ask.operation !== 'live' || transport !== 'RemoteServer.answer'
  const cases = internal.filter(speaks)

  it.each(cases)(
    '$name: answers "Internal error" and an incident, and sends nothing of the cause',
    async ({ server, who, ask }) => {
      const failed = await over(server, who ?? 'ada', ask)
      expect(failed.message).toBe('Internal error')
      expect(failed.incident).toMatch(/^[0-9a-f]{16}$/)
      expect(failed.sent).not.toContain('SECRET-CANARY')
      expect(failed.sent).not.toContain('hunter2')
    },
  )

  it.each(cases)(
    '$name: reports the cause under the incident it answered',
    async ({ server, who, ask, during, canary }) => {
      const failed = await over(server, who ?? 'ada', ask)
      expect(failed.reported).toEqual([
        expect.objectContaining({
          _tag: 'ServerDefect',
          level: 'error',
          incident: failed.incident,
          during,
          message: expect.stringContaining(canary),
        }),
      ])
      expect(failed.reported[0]?.message).toContain(`incident ${failed.incident}: ${during} failed`)
    },
  )

  it.each(tellings.filter(speaks))(
    'sends $name’s own words where its Source told them, with no incident',
    async ({ ask }) => {
      const failed = await over(custom, 'ada', ask)
      expect(failed).toMatchObject({ message: told, incident: undefined, reported: [] })
    },
  )

  it('sends a memory list’s lost cursor as it is: the caller’s own', async () => {
    const failed = await over(memory, 'ada', queryOf('AllNotes', { first: 5, after: 'gone' }))
    expect(failed).toMatchObject({
      message: 'Cursor "gone" names a row that no longer exists',
      incident: undefined,
      reported: [],
    })
  })
})

describe('what a Source wrote for its caller', () => {
  const answer = (ask: Ask) =>
    Effect.runPromise(RemoteServer.answer(RemoteServer.handlers(custom, 'ada'), ask))

  it('sends a declared refusal and its message as written', async () => {
    expect(await answer(mutateOf('Refused'))).toEqual({
      status: 422,
      body: { error: 'Someone changed it first', refusal: { _tag: 'Conflict' } },
    })
  })

  it('sends a denial’s reason as written', async () => {
    expect(await answer(mutateOf('ForbiddenWrite'))).toMatchObject({
      status: 403,
      body: { forbidden: { reason: 'Only an editor may' } },
    })
  })

  it.each([
    ['an unknown query', queryOf('Nope'), 'Unknown query: Nope'],
    ['an unknown mutation', mutateOf('Nope'), 'Unknown mutation: Nope'],
    [
      'an input its Schema refuses',
      {
        ...mutateOf('ToldWrite'),
        payload: { ...mutateOf('ToldWrite').payload, input: { note: 3 } },
      },
      'Invalid mutation input',
    ],
  ])('says %s in its own fixed words, with no incident', async (_, ask, error) => {
    expect(await answer(ask)).toEqual({ status: 500, body: { error } })
  })
})

describe('the incident, on the client', () => {
  const Data = Remote.make({
    model: App.model.remote,
    entities: [Driver],
    mutations: [DriverWrite, ToldWrite],
  })
  const json = Remote.json(request =>
    Effect.runPromise(
      RemoteServer.answer(RemoteServer.handlers(custom, 'ada'), JSON.parse(request)).pipe(
        Effect.provideService(Diagnostics.Reporter, () => Effect.void),
      ),
    ).then(answered => answered.body),
  )
  const client = Remote.clientLayer(json)
  /** The error `mutation` settles with in the Model, sent through the JSON client. */
  const failure = async (mutation: typeof DriverWrite | typeof ToldWrite) => {
    const started = Data.mutate({ remote: Remote.initial }, mutation, {})
    const settled = await Effect.runPromise(started.command.effect.pipe(Effect.provide(client)))
    const state = Data.mutation(Data.reduce(started.model, settled), started.requestId)
    if (state._tag !== 'Failed') throw new Error(`expected Failed, got ${state._tag}`)
    return state.error
  }

  const calls: ReadonlyArray<
    readonly [string, () => Effect.Effect<unknown, { readonly message: string }>]
  > = [
    ['a read', () => json.FoldkitRemoteRead(readOf('Driver').payload)],
    ['a query', () => json.FoldkitRemoteQuery(queryOf('DriverList').payload)],
    ['a mutation', () => json.FoldkitRemoteMutate(mutateOf('DriverWrite').payload)],
  ]
  it.each(calls)('is on the error %s fails with over JSON', async (_, call) => {
    const error = await Effect.runPromise(Effect.flip(call()))
    expect(error).toMatchObject({
      message: 'Internal error',
      incident: expect.stringMatching(/^[0-9a-f]{16}$/),
    })
  })

  it('is read from a failed write in the Model with RemoteData.incident', async () => {
    const error = await failure(DriverWrite)
    expect(error.message).toBe('Internal error')
    expect(RemoteData.incident(error)).toEqual(Option.some(expect.stringMatching(/^[0-9a-f]{16}$/)))
  })

  it('is none for a failure the Source told', async () => {
    const error = await failure(ToldWrite)
    expect(error.message).toBe(told)
    expect(RemoteData.incident(error)).toEqual(Option.none())
  })
})

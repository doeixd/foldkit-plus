import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import { Entity as EntityDefinition, Write } from 'foldkit-entity'
import { RpcTest } from 'effect/rpc'
import {
  Entity,
  Mutation,
  REMOTE_PROTOCOL_VERSION,
  RemoteRpc,
  type ReadRequest,
} from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { RemoteServer, RemoteServerError, type EntityWriter, type LiveHub } from '../src/index.js'

const User = Entity.make(
  'User',
  Schema.Struct({ id: Schema.String, name: Schema.String, email: Schema.String }),
)

const rows: Record<string, Record<string, unknown>> = {
  u1: { name: 'ada', email: 'ada@x' },
  u2: { name: 'grace', email: 'grace@x' },
}
const reads: Array<{
  ids: ReadonlyArray<string>
  fields: ReadonlyArray<string>
  principal: string
}> = []

const entities = [
  RemoteServer.entity<string>(User, {
    authorize: (principal, fields) =>
      principal === 'admin' ? fields : fields.filter(field => field !== 'email'),
    read: ({ ids, fields, principal }) =>
      Effect.sync(() => {
        reads.push({ ids, fields, principal })
        return ids.flatMap(id => {
          const row = rows[id]
          return row === undefined
            ? []
            : [{ id, values: Object.fromEntries(fields.map(field => [field, row[field]])) }]
        })
      }),
  }),
]
const server = RemoteServer.make({ entities })

type Request = Schema.Schema.Type<typeof ReadRequest>

/** Subscribes through the RPC handlers and collects `count` events, then leaves. */
const subscribe = (
  hub: LiveHub<string>,
  principal: string,
  requirements: ReadonlyArray<Request>,
  after: number,
  count: number,
) =>
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(RemoteRpc)
    return yield* client
      .FoldkitRemoteLive({ version: REMOTE_PROTOCOL_VERSION, requirements, after })
      .pipe(Stream.take(count), Stream.runCollect)
  }).pipe(
    Effect.scoped,
    Effect.provide(RemoteRpc.toLayer(RemoteServer.handlers(server, principal, { live: hub }))),
  )

const settle = Effect.gen(function* () {
  for (let i = 0; i < 5; i++) yield* Effect.yieldNow
})

describe('RemoteServer.liveHub', () => {
  it('re-reads the changed fields a subscriber selects and streams them from its cursor', async () => {
    reads.length = 0
    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(entities)
        const fiber = yield* Effect.forkChild(
          subscribe(hub, 'admin', [{ entity: 'User', id: 'u1', fields: ['name'] }], 4, 1),
        )
        yield* settle
        yield* hub.changed({ entity: 'User', id: 'u1' }, ['name', 'email'])
        return [...(yield* Fiber.join(fiber))]
      }),
    )
    expect(events).toEqual([
      {
        _tag: 'EntityPatched',
        cursor: 5,
        entity: 'User',
        id: 'u1',
        values: { name: 'ada' },
        changed: ['name'],
      },
    ])
    expect(reads).toEqual([{ ids: ['u1'], fields: ['name'], principal: 'admin' }])
  })

  it('does no source work for a subscriber that selects none of the changed fields', async () => {
    reads.length = 0
    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(entities)
        const fiber = yield* Effect.forkChild(
          subscribe(hub, 'admin', [{ entity: 'User', id: 'u1', fields: ['name'] }], 0, 1),
        )
        yield* settle
        yield* hub.changed({ entity: 'User', id: 'u1' }, ['email'])
        yield* hub.changed({ entity: 'User', id: 'u2' }, ['name'])
        expect(reads).toEqual([])
        yield* hub.changed({ entity: 'User', id: 'u1' }, ['name'])
        return [...(yield* Fiber.join(fiber))]
      }),
    )
    expect(events.map(event => event._tag)).toEqual(['EntityPatched'])
    expect(reads).toHaveLength(1)
  })

  it('authorizes the re-read under each subscriber’s principal', async () => {
    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(entities)
        const member = yield* Effect.forkChild(
          subscribe(hub, 'member', [{ entity: 'User', id: 'u1', fields: ['name', 'email'] }], 0, 1),
        )
        const admin = yield* Effect.forkChild(
          subscribe(hub, 'admin', [{ entity: 'User', id: 'u1', fields: ['name', 'email'] }], 0, 1),
        )
        yield* settle
        yield* hub.changed({ entity: 'User', id: 'u1' }, ['email', 'name'])
        return { member: [...(yield* Fiber.join(member))], admin: [...(yield* Fiber.join(admin))] }
      }),
    )
    expect(events.member[0]).toMatchObject({ values: { name: 'ada' }, changed: ['name'] })
    expect(events.admin[0]).toMatchObject({
      values: { email: 'ada@x', name: 'ada' },
      changed: ['email', 'name'],
    })
  })

  it('a change of only forbidden fields reaches nobody', async () => {
    reads.length = 0
    await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(entities)
        const fiber = yield* Effect.forkChild(
          subscribe(hub, 'member', [{ entity: 'User', id: 'u1', fields: ['email'] }], 0, 1),
        )
        yield* settle
        yield* hub.changed({ entity: 'User', id: 'u1' }, ['email'])
        yield* settle
        expect(reads).toEqual([])
        yield* Fiber.interrupt(fiber)
      }),
    )
  })

  it('subscribers sharing a principal share one source read', async () => {
    reads.length = 0
    await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(entities)
        const a = yield* Effect.forkChild(
          subscribe(hub, 'admin', [{ entity: 'User', id: 'u1', fields: ['name'] }], 0, 1),
        )
        const b = yield* Effect.forkChild(
          subscribe(hub, 'admin', [{ entity: 'User', id: 'u1', fields: ['email'] }], 0, 1),
        )
        yield* settle
        yield* hub.changed({ entity: 'User', id: 'u1' }, ['name', 'email'])
        const [first, second] = [[...(yield* Fiber.join(a))][0], [...(yield* Fiber.join(b))][0]]
        expect(first).toMatchObject({ values: { name: 'ada' } })
        expect(second).toMatchObject({ values: { email: 'ada@x' } })
      }),
    )
    expect(reads).toEqual([{ ids: ['u1'], fields: ['name', 'email'], principal: 'admin' }])
  })

  it('deleted reaches every subscriber of the entity, with the next cursor', async () => {
    const kept = rows.u1!
    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(entities)
        const fiber = yield* Effect.forkChild(
          subscribe(hub, 'admin', [{ entity: 'User', id: 'u1', fields: ['name'] }], 9, 2),
        )
        yield* settle
        // u2's deletion is not this subscriber's; it must not consume a cursor.
        yield* hub.deleted({ entity: 'User', id: 'u2' })
        yield* hub.changed({ entity: 'User', id: 'u1' }, ['name'])
        delete rows.u1
        yield* hub.deleted({ entity: 'User', id: 'u1' })
        return [...(yield* Fiber.join(fiber))]
      }),
    ).finally(() => {
      rows.u1 = kept
    })
    expect(events.map(event => [event._tag, event.cursor])).toEqual([
      ['EntityPatched', 10],
      ['EntityDeleted', 11],
    ])
  })

  it('a subscriber leaves the hub when its stream ends', async () => {
    const sizes = await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(entities)
        const fiber = yield* Effect.forkChild(
          subscribe(hub, 'admin', [{ entity: 'User', id: 'u1', fields: ['name'] }], 0, 1),
        )
        yield* settle
        const during = yield* hub.size
        yield* hub.changed({ entity: 'User', id: 'u1' }, ['name'])
        yield* Fiber.join(fiber)
        yield* settle
        return { during, after: yield* hub.size }
      }),
    )
    expect(sizes).toEqual({ during: 1, after: 0 })
  })

  it('a source failure surfaces to the caller of changed', async () => {
    const failing = RemoteServer.make({
      entities: [
        RemoteServer.entity<string>(User, {
          read: () => Effect.fail(new RemoteServerError({ message: 'db down' })),
        }),
      ],
    })
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub([...failing.entities.values()])
        const fiber = yield* Effect.forkChild(
          Effect.scoped(
            Effect.gen(function* () {
              const client = yield* RpcTest.makeClient(RemoteRpc)
              return yield* client
                .FoldkitRemoteLive({
                  version: REMOTE_PROTOCOL_VERSION,
                  requirements: [{ entity: 'User', id: 'u1', fields: ['name'] }],
                  after: 0,
                })
                .pipe(Stream.take(1), Stream.runCollect)
            }),
          ).pipe(
            Effect.provide(
              RemoteRpc.toLayer(RemoteServer.handlers(failing, 'admin', { live: hub })),
            ),
          ),
        )
        yield* settle
        const outcome = yield* Effect.result(hub.changed({ entity: 'User', id: 'u1' }, ['name']))
        yield* Fiber.interrupt(fiber)
        return outcome
      }),
    )
    expect(result._tag).toBe('Failure')
  })
})

describe('RemoteServer.liveHub guards', () => {
  it('a change of a row the source no longer returns is its deletion', async () => {
    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(entities)
        const fiber = yield* Effect.forkChild(
          subscribe(hub, 'admin', [{ entity: 'User', id: 'gone', fields: ['name'] }], 0, 1),
        )
        yield* settle
        yield* hub.changed({ entity: 'User', id: 'gone' }, ['name'])
        return [...(yield* Fiber.join(fiber))]
      }),
    )
    expect(events).toEqual([{ _tag: 'EntityDeleted', cursor: 1, entity: 'User', id: 'gone' }])
  })

  it('a record the source returns for another id reaches nobody', async () => {
    const wrongId = [
      RemoteServer.entity<string>(User, {
        read: ({ fields }) =>
          Effect.succeed([
            { id: 'u2', values: Object.fromEntries(fields.map(field => [field, 'x'])) },
          ]),
      }),
    ]
    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(wrongId)
        const fiber = yield* Effect.forkChild(
          subscribe(hub, 'admin', [{ entity: 'User', id: 'u1', fields: ['name'] }], 0, 1),
        )
        yield* settle
        yield* hub.changed({ entity: 'User', id: 'u1' }, ['name'])
        yield* hub.deleted({ entity: 'User', id: 'u1' })
        return [...(yield* Fiber.join(fiber))]
      }),
    )
    expect(events.map(event => event._tag)).toEqual(['EntityDeleted'])
  })

  it('a change of no fields does no source work', async () => {
    reads.length = 0
    await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(entities)
        const fiber = yield* Effect.forkChild(
          subscribe(hub, 'admin', [{ entity: 'User', id: 'u1', fields: ['name'] }], 0, 1),
        )
        yield* settle
        yield* hub.changed({ entity: 'User', id: 'u1' }, [])
        yield* hub.changed({ entity: 'Unknown', id: 'u1' }, ['name'])
        expect(reads).toEqual([])
        yield* Fiber.interrupt(fiber)
      }),
    )
  })

  it('forwards only the selected, permitted fields of a leaky source', async () => {
    const leaky = [
      RemoteServer.entity<string>(User, {
        authorize: (principal, fields) =>
          principal === 'admin' ? fields : fields.filter(field => field !== 'email'),
        read: ({ ids }) =>
          Effect.succeed(ids.map(id => ({ id, values: { ...rows[id], secret: 's' } }))),
      }),
    ]
    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(leaky)
        const fiber = yield* Effect.forkChild(
          subscribe(hub, 'member', [{ entity: 'User', id: 'u1', fields: ['name', 'email'] }], 0, 1),
        )
        yield* settle
        yield* hub.changed({ entity: 'User', id: 'u1' }, ['name', 'email', 'secret'])
        return [...(yield* Fiber.join(fiber))]
      }),
    )
    expect(events).toEqual([
      {
        _tag: 'EntityPatched',
        cursor: 1,
        entity: 'User',
        id: 'u1',
        values: { name: 'ada' },
        changed: ['name'],
      },
    ])
  })

  it('refuses a subscription naming more ids of one entity than the handler allows', async () => {
    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(entities)
        const layer = RemoteRpc.toLayer(
          RemoteServer.handlers(server, 'admin', { live: hub, maxIdsPerEntity: 1 }),
        )
        return yield* Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(RemoteRpc)
          return yield* Effect.result(
            client
              .FoldkitRemoteLive({
                version: REMOTE_PROTOCOL_VERSION,
                requirements: [
                  { entity: 'User', id: 'u1', fields: ['name'] },
                  { entity: 'User', id: 'u1', fields: ['email'] },
                  { entity: 'User', id: 'u2', fields: ['name'] },
                ],
                after: 0,
              })
              .pipe(Stream.runCollect),
          )
        }).pipe(Effect.scoped, Effect.provide(layer))
      }),
    )
    expect(outcome._tag).toBe('Failure')
    expect(String(outcome)).toContain('Too many "User" ids')
  })

  /** The principal of each source read one change makes, for these subscribers. */
  const rereads = (
    principals: ReadonlyArray<{ readonly role: string }>,
    options?: { readonly key?: (principal: { readonly role: string }) => unknown },
  ) => {
    const seen: Array<{ readonly role: string }> = []
    const byRole = [
      RemoteServer.entity<{ readonly role: string }>(User, {
        read: ({ ids, fields, principal }) => {
          seen.push(principal)
          return Effect.succeed(
            ids.map(id => ({
              id,
              values: Object.fromEntries(fields.map(field => [field, rows[id]?.[field]])),
            })),
          )
        },
      }),
    ]
    const requirements = [{ entity: 'User', id: 'u1', fields: ['name'] }]
    return Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(byRole, options)
        const fibers = yield* Effect.forEach(principals, principal =>
          Effect.forkChild(
            hub
              .subscribe({ requirements, after: 0, principal })
              .pipe(Stream.take(1), Stream.runCollect),
          ),
        )
        yield* settle
        yield* hub.changed({ entity: 'User', id: 'u1' }, ['name'])
        for (const fiber of fibers) yield* Fiber.join(fiber)
        return seen
      }),
    )
  }

  it('shares a read between subscribers only when their principals are the same value', async () => {
    const shared = { role: 'admin' }
    const copy = { role: 'admin' }
    expect(await rereads([shared, shared, copy])).toEqual([shared, copy])
  })

  it('shares a read between subscribers whose principals have one key, as the first', async () => {
    const first = { role: 'admin' }
    const viewer = { role: 'viewer' }
    const seen = await rereads([first, { role: 'admin' }, viewer], {
      key: principal => principal.role,
    })
    expect(seen).toHaveLength(2)
    expect(seen[0]).toBe(first)
    expect(seen[1]).toBe(viewer)
  })
})

describe('RemoteServer.liveHub windows', () => {
  const Post = Entity.make(
    'Post',
    Schema.Struct({ id: Schema.String, title: Schema.String, comments: Schema.String }),
  )
  const windowed: Array<unknown> = []
  const paged = RemoteServer.make({
    entities: [
      RemoteServer.entity<string>(Post, {
        read: ({ ids, fields, windows }) =>
          Effect.sync(() => {
            windowed.push(windows)
            return ids.map(id => ({
              id,
              values: Object.fromEntries(
                fields.map(field => [field, windows?.comments === undefined ? 'all' : 'page']),
              ),
            }))
          }),
      }),
    ],
  })

  it('re-reads a paged field with the window the subscriber selected it with', async () => {
    windowed.length = 0
    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub([...paged.entities.values()])
        const fiber = yield* Effect.forkChild(
          Effect.scoped(
            Effect.gen(function* () {
              const client = yield* RpcTest.makeClient(RemoteRpc)
              return yield* client
                .FoldkitRemoteLive({
                  version: REMOTE_PROTOCOL_VERSION,
                  requirements: [
                    {
                      entity: 'Post',
                      id: 'p1',
                      fields: ['title', 'comments'],
                      windows: { comments: { first: 2 } },
                    },
                  ],
                  after: 0,
                })
                .pipe(Stream.take(1), Stream.runCollect)
            }),
          ).pipe(
            Effect.provide(RemoteRpc.toLayer(RemoteServer.handlers(paged, 'u', { live: hub }))),
          ),
        )
        yield* settle
        yield* hub.changed({ entity: 'Post', id: 'p1' }, ['comments', 'title'])
        return [...(yield* Fiber.join(fiber))]
      }),
    )
    expect(windowed).toEqual([{ comments: { first: 2 } }])
    expect(events[0]).toMatchObject({ values: { comments: 'page', title: 'page' } })
  })

  it('subscribers paging a field differently get separate reads, each with its window', async () => {
    windowed.length = 0
    const sources = [...paged.entities.values()]
    const requirement = (window: { first: number } | undefined) => ({
      entity: 'Post',
      id: 'p1',
      fields: ['comments'],
      ...(window === undefined ? {} : { windows: { comments: window } }),
    })
    await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(sources)
        const listen = (window: { first: number } | undefined) =>
          Effect.forkChild(
            hub
              .subscribe({ requirements: [requirement(window)], after: 0, principal: 'u' })
              .pipe(Stream.take(1), Stream.runCollect),
          )
        const fibers = [
          yield* listen({ first: 2 }),
          yield* listen({ first: 5 }),
          yield* listen(undefined),
        ]
        yield* settle
        yield* hub.changed({ entity: 'Post', id: 'p1' }, ['comments'])
        for (const fiber of fibers) yield* Fiber.join(fiber)
      }),
    )
    expect(windowed).toEqual([{ comments: { first: 2 } }, { comments: { first: 5 } }, undefined])
  })
})

describe('A mutation’s outcome reaches live subscribers', () => {
  const Rename = Mutation.make('Rename', {
    Input: { id: Schema.String, name: Schema.String },
    Output: {},
  })
  const Remove = Mutation.make('Remove', { Input: { id: Schema.String }, Output: {} })
  const people: Record<string, Record<string, unknown>> = {}
  type Read = Parameters<typeof RemoteServer.entity<string>>[1]['read']
  const fromPeople: Read = ({ ids, fields }) =>
    Effect.succeed(
      ids.flatMap(id => {
        const row = people[id]
        return row === undefined
          ? []
          : [{ id, values: Object.fromEntries(fields.map(field => [field, row[field]])) }]
      }),
    )
  const mutations = [
    RemoteServer.mutation(Rename, ({ input }) =>
      Effect.sync(() => {
        people[input.id] = { ...people[input.id], name: input.name }
        return {
          output: {},
          entities: [{ entity: 'User', id: input.id, values: { name: input.name } }],
        }
      }),
    ),
    RemoteServer.mutation(Remove, ({ input }) =>
      Effect.sync(() => {
        delete people[input.id]
        return { output: {}, deleted: [{ entity: 'User', id: input.id }] }
      }),
    ),
  ]

  /**
   * One subscriber taking `count` events, while a mutation runs through the same
   * handlers. With `count` 0 it stays subscribed until the mutation has answered.
   */
  const observe = (
    read: Read,
    count: number,
    request: { readonly requestId: string; readonly mutation: string; readonly input: unknown },
  ) => {
    const entitySources = [RemoteServer.entity<string>(User, { read })]
    const served = RemoteServer.make({ entities: entitySources, mutations })
    return Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(entitySources)
        const layer = RemoteRpc.toLayer(RemoteServer.handlers(served, 'admin', { live: hub }))
        const fiber = yield* Effect.forkChild(
          Effect.scoped(
            Effect.gen(function* () {
              const client = yield* RpcTest.makeClient(RemoteRpc)
              return yield* client
                .FoldkitRemoteLive({
                  version: REMOTE_PROTOCOL_VERSION,
                  requirements: [{ entity: 'User', id: 'u1', fields: ['name'] }],
                  after: 0,
                })
                .pipe(Stream.take(Math.max(count, 1)), Stream.runCollect)
            }),
          ).pipe(Effect.provide(layer)),
        )
        yield* settle
        const answered = yield* Effect.scoped(
          Effect.flatMap(RpcTest.makeClient(RemoteRpc), client =>
            client.FoldkitRemoteMutate(request),
          ),
        ).pipe(Effect.provide(layer), Effect.result)
        const events = count === 0 ? [] : [...(yield* Fiber.join(fiber))]
        if (count === 0) yield* Fiber.interrupt(fiber)
        return { answered, events }
      }),
    )
  }

  it('publishes the patch it answers with, with no hub call in the handler', async () => {
    people.u1 = { name: 'ada' }
    const { answered, events } = await observe(fromPeople, 1, {
      requestId: 'r1',
      mutation: 'Rename',
      input: { id: 'u1', name: 'Ada' },
    })
    expect(answered._tag).toBe('Success')
    expect(events).toMatchObject([
      { _tag: 'EntityPatched', entity: 'User', id: 'u1', values: { name: 'Ada' } },
    ])
  })

  it('publishes a deletion it answers with', async () => {
    people.u1 = { name: 'ada' }
    const { events } = await observe(fromPeople, 1, {
      requestId: 'r2',
      mutation: 'Remove',
      input: { id: 'u1' },
    })
    expect(events).toMatchObject([{ _tag: 'EntityDeleted', entity: 'User', id: 'u1' }])
  })

  it('answers the mutation though its publish failed, since the write has committed', async () => {
    people.u1 = { name: 'ada' }
    const { answered } = await observe(
      () => Effect.fail(new RemoteServerError({ message: 'db down' })),
      0,
      { requestId: 'r3', mutation: 'Rename', input: { id: 'u1', name: 'Ada' } },
    )
    expect(answered._tag).toBe('Success')
    expect(people.u1).toEqual({ name: 'Ada' })
  })
})

describe('Shared fields on the live hub', () => {
  const Person = EntityDefinition.define(
    'Person',
    Schema.Struct({ id: Schema.String, name: Schema.String, email: Schema.String }),
  )
  const people: Record<string, Record<string, unknown>> = {}
  const sourceReads: Array<ReadonlyArray<string>> = []
  // `name` is everyone's alike; `email` only an admin's.
  const personSource = RemoteServer.entity<string>(Person, {
    shared: ['name'],
    authorize: (principal, fields) =>
      principal === 'admin' ? fields : fields.filter(field => field !== 'email'),
    read: ({ ids, fields }) =>
      Effect.sync(() => {
        sourceReads.push(fields)
        return ids.flatMap(id => {
          const row = people[id]
          return row === undefined
            ? []
            : [{ id, values: Object.fromEntries(fields.map(field => [field, row[field]])) }]
        })
      }),
  })
  const RenamePerson = Mutation.write(
    'RenamePerson',
    Write.update(
      EntityDefinition.input(Person, Schema.Struct({ id: Schema.String, name: Schema.String })),
      { id: 'id' },
    ),
  )
  const RenameByHand = Mutation.make('RenameByHand', {
    Input: { id: Schema.String, name: Schema.String },
    Output: {},
  })
  const writer: EntityWriter<string> = {
    entity: 'Person',
    update: ({ id, values }) =>
      Effect.sync(() => {
        people[id] = { ...people[id], ...values }
        return Option.some(values)
      }),
    insert: () => Effect.die('no inserts'),
    delete: () => Effect.die('no deletes'),
  }
  const served = RemoteServer.make({
    entities: [personSource],
    mutations: [
      RemoteServer.write(RenamePerson, writer),
      // A handler's answer is its own claim, so it is read again.
      RemoteServer.mutation(RenameByHand, ({ input }) =>
        Effect.sync(() => {
          people[input.id] = { ...people[input.id], name: input.name }
          return {
            output: {},
            entities: [{ entity: 'Person', id: input.id, values: { name: 'claimed' } }],
          }
        }),
      ),
    ],
  })

  /** Each principal's first event after `act`, subscribed to both of u1's fields. */
  const observe = (
    principals: ReadonlyArray<string>,
    act: (hub: LiveHub<string>) => Effect.Effect<unknown, unknown>,
    windows?: Readonly<Record<string, { readonly first: number }>>,
  ) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub([personSource])
        const fibers = yield* Effect.forEach(principals, principal =>
          Effect.forkChild(
            Effect.scoped(
              Effect.gen(function* () {
                const client = yield* RpcTest.makeClient(RemoteRpc)
                return yield* client
                  .FoldkitRemoteLive({
                    version: REMOTE_PROTOCOL_VERSION,
                    requirements: [
                      {
                        entity: 'Person',
                        id: 'u1',
                        fields: ['name', 'email'],
                        ...(windows === undefined ? {} : { windows }),
                      },
                    ],
                    after: 0,
                  })
                  .pipe(Stream.take(1), Stream.runCollect)
              }),
            ).pipe(
              Effect.provide(
                RemoteRpc.toLayer(RemoteServer.handlers(served, principal, { live: hub })),
              ),
            ),
          ),
        )
        yield* settle
        sourceReads.length = 0
        yield* act(hub)
        return yield* Effect.forEach(fibers, fiber =>
          Effect.map(Fiber.join(fiber), events => [...events][0]),
        )
      }),
    )

  it('sends a shared field’s written value with no read, and re-reads the rest per principal', async () => {
    people.u1 = { name: 'Ada', email: 'ada@x' }
    const [member, admin] = await observe(['member', 'admin'], hub =>
      hub.changed({ entity: 'Person', id: 'u1' }, ['name'], { name: 'Ada' }),
    )
    expect(member).toMatchObject({ values: { name: 'Ada' }, changed: ['name'] })
    expect(admin).toMatchObject({ values: { name: 'Ada' }, changed: ['name'] })
    expect(sourceReads).toEqual([])
  })

  it('re-reads a field that is not shared, though its value was given', async () => {
    people.u1 = { name: 'Ada', email: 'ada@y' }
    const [member, admin] = await observe(['member', 'admin'], hub =>
      Effect.andThen(
        hub.changed({ entity: 'Person', id: 'u1' }, ['email'], { email: 'ada@y' }),
        hub.changed({ entity: 'Person', id: 'u1' }, ['name'], { name: 'Ada' }),
      ),
    )
    // The member may not read `email`: its first event is the name.
    expect(member).toMatchObject({ values: { name: 'Ada' }, changed: ['name'] })
    expect(admin).toMatchObject({ values: { email: 'ada@y' }, changed: ['email'] })
    expect(sourceReads).toEqual([['email']])
  })

  it('re-reads a shared field its subscriber selected with a window', async () => {
    people.u1 = { name: 'Ada', email: 'ada@x' }
    const [member] = await observe(
      ['member'],
      hub => hub.changed({ entity: 'Person', id: 'u1' }, ['name'], { name: 'Ada' }),
      { name: { first: 1 } },
    )
    expect(member).toMatchObject({ values: { name: 'Ada' } })
    expect(sourceReads).toEqual([['name']])
  })

  it('publishes a declared write’s shared values as stored, and reads a handler’s again', async () => {
    const mutate = (mutation: string, name: string) => (hub: LiveHub<string>) =>
      Effect.scoped(
        Effect.flatMap(RpcTest.makeClient(RemoteRpc), client =>
          client.FoldkitRemoteMutate({ requestId: name, mutation, input: { id: 'u1', name } }),
        ),
      ).pipe(
        Effect.provide(RemoteRpc.toLayer(RemoteServer.handlers(served, 'admin', { live: hub }))),
      )
    people.u1 = { name: 'Ada', email: 'ada@x' }
    expect(await observe(['member'], mutate('RenamePerson', 'Grace'))).toMatchObject([
      { values: { name: 'Grace' } },
    ])
    expect(sourceReads).toEqual([])
    expect(await observe(['member'], mutate('RenameByHand', 'Hedy'))).toMatchObject([
      { values: { name: 'Hedy' } },
    ])
    expect(sourceReads).toEqual([['name']])
  })

  it('refuses a shared field the source does not serve', () => {
    expect(() =>
      RemoteServer.entity(Person, { shared: ['nickname'], read: () => Effect.succeed([]) }),
    ).toThrow("Person's shared fields name no member: nickname")
  })
})

describe('The live hub asks each subscriber again', () => {
  // `ada` reads every row; `bo` only rows that are not secret; `broken` makes the read fail.
  const notes: Record<string, { readonly body: string; readonly secret: boolean }> = {}
  const Note = Entity.make('Note', Schema.Struct({ id: Schema.String, body: Schema.String }))
  const noteSources = [
    RemoteServer.entity<string>(Note, {
      read: ({ ids, fields, principal }) =>
        principal === 'broken'
          ? Effect.fail(new RemoteServerError({ message: 'db down' }))
          : Effect.succeed(
              ids.flatMap(id => {
                const note = notes[id]
                return note === undefined || (note.secret && principal !== 'ada')
                  ? []
                  : [{ id, values: Object.fromEntries(fields.map(field => [field, note.body])) }]
              }),
            ),
    }),
  ]
  const noteServer = RemoteServer.make({ entities: noteSources })
  const first = (hub: LiveHub<string>, principal: string) =>
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(RemoteRpc)
        return yield* client
          .FoldkitRemoteLive({
            version: REMOTE_PROTOCOL_VERSION,
            requirements: [{ entity: 'Note', id: 'n1', fields: ['body'] }],
            after: 0,
          })
          .pipe(Stream.take(1), Stream.runCollect)
      }),
    ).pipe(
      Effect.provide(
        RemoteRpc.toLayer(RemoteServer.handlers(noteServer, principal, { live: hub })),
      ),
      Effect.map(events => [...events][0]),
    )

  it('sends a deletion only to whom the row is gone, and the rest what they now see', async () => {
    notes.n1 = { body: 'Hidden now', secret: true }
    const [ada, bo] = await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(noteSources)
        const fibers = yield* Effect.forEach(['ada', 'bo'], principal =>
          Effect.forkChild(first(hub, principal)),
        )
        yield* settle
        yield* hub.deleted({ entity: 'Note', id: 'n1' })
        return yield* Effect.forEach(fibers, Fiber.join)
      }),
    )
    expect(ada).toMatchObject({ _tag: 'EntityPatched', values: { body: 'Hidden now' } })
    expect(bo).toMatchObject({ _tag: 'EntityDeleted', id: 'n1' })
  })

  it('sends the rest their change though one principal’s read failed, then fails', async () => {
    notes.n1 = { body: 'Changed', secret: false }
    const { failed, ada } = await Effect.runPromise(
      Effect.gen(function* () {
        const hub = yield* RemoteServer.liveHub(noteSources)
        // The broken subscriber subscribes first, so its group is read first.
        const broken = yield* Effect.forkChild(first(hub, 'broken'))
        const ada = yield* Effect.forkChild(first(hub, 'ada'))
        yield* settle
        const failed = yield* Effect.result(hub.changed({ entity: 'Note', id: 'n1' }, ['body']))
        yield* Fiber.interrupt(broken)
        return { failed, ada: yield* Fiber.join(ada) }
      }),
    )
    expect(failed._tag).toBe('Failure')
    expect(ada).toMatchObject({ _tag: 'EntityPatched', values: { body: 'Changed' } })
  })
})

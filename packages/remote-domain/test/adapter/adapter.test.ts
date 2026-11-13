// @vitest-environment node
/**
 * `DomainRemote.layer` over the adapter's model hosted in memory with every
 * View delivery held until `control.drain` (`manual`), so a View is behind
 * each write until a test lets it catch up.
 */
import { Effect, Fiber, Layer, Option, Optic, Ref, Schema, Stream } from 'effect'
import { Entity, Write } from 'foldkit-entity'
import { Mutation, Refusal, Remote, RemoteClient, REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import { Law } from 'foldkit-remote/testing'
import { ModelRef } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { DomainReads, DomainRemote } from '../../src/index.js'
import {
  invalidOf,
  NotedProduct,
  ProductEntity,
  Reserve,
  ShopApi,
  StaffProduct,
} from './fixture.js'
import { bound, world as makeWorld, type World } from './transport.js'

/** Runs a body in a fresh world, with p1 seeded for ada (stock 10) and its View caught up. */
const run = <A, E>(
  body: (world: World) => Effect.Effect<A, E, Layer.Success<ReturnType<typeof bound>>>,
) => {
  const world = makeWorld()
  return Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* ShopApi.Client
      yield* client.Seed('p1', { ownerId: 'ada', stock: 10 })
      yield* world.control.drain
      return yield* body(world)
    }).pipe(Effect.scoped, Effect.provide(bound(world))),
  )
}

const reserve = (
  operation: string | undefined,
  input: { readonly quantity: number; readonly revision: number },
  principal: string | null = 'ada',
) =>
  Effect.flatMap(RemoteClient, client =>
    client.mutate({
      requestId: 'r1',
      ...(operation === undefined ? {} : { operation }),
      mutation: 'ReserveStock',
      input: { id: 'p1', ...input },
      principal,
    }),
  )

const fields = ['ownerId', 'stock', 'reserved', 'note', 'revision']

const readP1 = Effect.flatMap(RemoteClient, client =>
  client.read({
    version: REMOTE_PROTOCOL_VERSION,
    requests: [{ entity: 'Product', id: 'p1', fields }],
  }),
)

const touch = (note: string) =>
  Effect.flatMap(ShopApi.Client, client => client.Touch('p1', { note }))

describe('a write whose View is behind', () => {
  it('commits, answers the reply as the row, and stays pending until its read confirms', async () => {
    const seen = await run(world =>
      Effect.gen(function* () {
        const reads = yield* DomainReads
        const answer = yield* reserve('op1', { quantity: 2, revision: 1 })
        const pending = yield* reads.pending
        const early = yield* reads.confirm(ProductEntity, 'p1')
        const stillPending = yield* reads.pending
        yield* world.control.drain
        const late = yield* reads.confirm(ProductEntity, 'p1')
        return { answer, pending, early, stillPending, late, after: yield* reads.pending }
      }),
    )
    expect(seen.answer.entities).toEqual([
      { entity: 'Product', id: 'p1', values: { reserved: 2, revision: 2 } },
    ])
    expect(seen.answer.principal).toBe('ada')
    const pending = [
      {
        entity: 'Product',
        id: 'p1',
        operation: 'op1',
        receipt: { stream: 'Product/p1', version: 2 },
      },
    ]
    expect(seen.pending).toEqual(pending)
    expect(seen.early).toBe(false)
    expect(seen.stillPending).toEqual(pending)
    expect(seen.late).toBe(true)
    expect(seen.after).toEqual([])
  })

  it('reads at the receipt: behind fails Unreachable rather than answer the row from before', async () => {
    const seen = await run(world =>
      Effect.gen(function* () {
        yield* reserve('op1', { quantity: 2, revision: 1 })
        const behind = yield* Effect.flip(readP1)
        yield* world.control.drain
        return { behind, caught: yield* readP1 }
      }),
    )
    expect(seen.behind._tag).toBe('Unreachable')
    expect(seen.caught.entities[0]?.values).toMatchObject({ reserved: 2, revision: 2 })
  })

  it('sends a retried operation no second command, and reads with its receipt', async () => {
    const seen = await run(world =>
      Effect.gen(function* () {
        yield* reserve('op1', { quantity: 2, revision: 1 })
        const sent = world.calls('ReserveStock')
        yield* world.control.drain
        const again = yield* reserve('op1', { quantity: 2, revision: 1 })
        return { sent, resent: world.calls('ReserveStock'), commits: world.control.commits, again }
      }),
    )
    expect(seen.sent).toBe(1)
    expect(seen.resent).toBe(1)
    expect(seen.commits).toHaveLength(2)
    expect(seen.again.entities[0]?.values).toEqual({
      ownerId: 'ada',
      stock: 10,
      reserved: 2,
      note: '',
      revision: 2,
    })
  })
})

describe('what a write fails with', () => {
  it('decodes a typed Rejection with the mutation’s Refusal', async () => {
    const [invalid, moved] = await run(() =>
      Effect.all([
        Effect.flip(reserve('op1', { quantity: 20, revision: 1 })),
        Effect.flip(reserve('op2', { quantity: 1, revision: 7 })),
      ]),
    )
    const decode = Schema.decodeUnknownSync(Reserve.Refusal)
    expect(invalid._tag).toBe('RemoteMutationError')
    expect(moved._tag).toBe('RemoteMutationError')
    const refused = decode(invalid._tag === 'RemoteMutationError' ? invalid.refusal : undefined)
    expect(refused).toEqual(invalidOf({ _tag: 'Invalid', rule: 'reservedWithinStock' } as never))
    expect(Refusal.isInvalid(refused)).toBe(true)
    expect(
      Refusal.isConflict(decode(moved._tag === 'RemoteMutationError' ? moved.refusal : undefined)),
    ).toBe(true)
  })

  it('answers a middleware refusal as Unauthenticated, and a non-owner as Forbidden', async () => {
    const [signedOut, notOwner] = await run(world =>
      Effect.gen(function* () {
        yield* Ref.set(world.actor, Option.none())
        const signedOut = yield* Effect.flip(reserve('op1', { quantity: 1, revision: 1 }, null))
        yield* Ref.set(world.actor, Option.some('grace'))
        const notOwner = yield* Effect.flip(reserve('op2', { quantity: 1, revision: 1 }, 'grace'))
        return [signedOut, notOwner] as const
      }),
    )
    expect(signedOut._tag).toBe('Unauthenticated')
    expect(notOwner).toMatchObject({
      _tag: 'Forbidden',
      reason: 'Only its owner reserves its stock',
    })
  })

  it('answers a lost reply Unreachable, and its retry is the same command', async () => {
    const seen = await run(world =>
      Effect.gen(function* () {
        world.loseReply('ReserveStock')
        const lost = yield* Effect.flip(reserve('op1', { quantity: 2, revision: 1 }))
        const retried = yield* reserve('op1', { quantity: 2, revision: 1 })
        return { lost, retried, ids: world.commandIds, commits: world.control.commits }
      }),
    )
    expect(seen.lost._tag).toBe('Unreachable')
    expect(seen.ids).toHaveLength(2)
    expect(seen.ids[0]).toBe(seen.ids[1])
    expect(seen.ids[0]).toMatch(/^ReserveStock:op1:[0-9a-f]{32}$/)
    // Domain answered the retry from its first commit: nothing was reserved twice.
    expect(seen.commits).toHaveLength(2)
    expect(seen.retried.entities[0]?.values).toEqual({ reserved: 2, revision: 2 })
  })
})

describe('the command id', () => {
  it('differs for another principal: their write is decided afresh', async () => {
    const graces = await run(world =>
      Effect.gen(function* () {
        yield* reserve('op1', { quantity: 2, revision: 1 })
        yield* Ref.set(world.actor, Option.some('grace'))
        return yield* Effect.flip(reserve('op1', { quantity: 2, revision: 1 }, 'grace'))
      }),
    )
    expect(graces._tag).toBe('Forbidden')
  })

  it('differs for another input: it is decided afresh', async () => {
    const other = await run(() =>
      Effect.gen(function* () {
        yield* reserve('op1', { quantity: 2, revision: 1 })
        return yield* Effect.flip(reserve('op1', { quantity: 3, revision: 1 }))
      }),
    )
    expect(other._tag).toBe('RemoteMutationError')
    expect(
      Refusal.isConflict(
        Schema.decodeUnknownSync(Reserve.Refusal)(
          other._tag === 'RemoteMutationError' ? other.refusal : undefined,
        ),
      ),
    ).toBe(true)
  })
})

describe('what a write refuses before sending anything', () => {
  it.each([
    { what: 'no operation', operation: undefined, principal: 'ada', fails: 'RemoteMutationError' },
    { what: 'another principal', operation: 'op1', principal: 'grace', fails: 'PrincipalChanged' },
  ])('$what', async ({ operation, principal, fails }) => {
    const seen = await run(world =>
      Effect.map(
        Effect.flip(reserve(operation, { quantity: 1, revision: 1 }, principal)),
        error => ({ error, sent: world.calls('ReserveStock') }),
      ),
    )
    expect(seen.error._tag).toBe(fails)
    expect(seen.sent).toBe(0)
  })
})

describe('rows of one key', () => {
  it('reaches live as a patch when the state changes with no output event', async () => {
    const events = await run(world =>
      Effect.gen(function* () {
        const client = yield* RemoteClient
        const watching = yield* client
          .live({
            requirements: [{ entity: 'Product', id: 'p1', fields: ['note', 'revision'] }],
            queries: [],
            after: 40,
          })
          .pipe(Stream.take(3), Stream.runCollect, Effect.forkChild)
        yield* Effect.sleep('50 millis')
        yield* touch('hello')
        yield* world.control.drain
        yield* Effect.sleep('20 millis')
        yield* touch('again')
        yield* world.control.drain
        return yield* Fiber.join(watching)
      }),
    )
    expect(events.map(event => event._tag)).toEqual([
      'EntityPatched',
      'EntityPatched',
      'EntityPatched',
    ])
    expect(events.map(event => (event._tag === 'EntityPatched' ? event.values : null))).toEqual([
      { note: '', revision: 1 },
      { note: 'hello', revision: 2 },
      { note: 'again', revision: 3 },
    ])
    expect(events[1]?._tag === 'EntityPatched' && events[1].changed).toEqual(['note', 'revision'])
    // Remote drops an event at or before the last cursor: each must move past it.
    expect(events.map(event => event.cursor)).toEqual([41, 42, 43])
  })

  it('does not send a read a snapshot older than one already let through', async () => {
    const late = await run(world =>
      Effect.gen(function* () {
        const release = world.holdReply('ProductRow.snapshot')
        const first = yield* Effect.forkChild(readP1)
        yield* Effect.sleep('20 millis')
        yield* touch('hello')
        yield* world.control.drain
        yield* readP1
        yield* release
        return yield* Fiber.join(first)
      }),
    )
    expect(late.entities[0]?.values).toMatchObject({ note: 'hello', revision: 2 })
  })

  it('does not send live a snapshot older than one already sent', async () => {
    const events = await run(world =>
      Effect.gen(function* () {
        const client = yield* RemoteClient
        const watching = yield* client
          .live({
            requirements: [{ entity: 'Product', id: 'p1', fields: ['note', 'revision'] }],
            queries: [],
            after: 0,
          })
          .pipe(Stream.take(3), Stream.runCollect, Effect.forkChild)
        yield* Effect.sleep('50 millis')
        yield* touch('hello')
        yield* world.control.drain
        yield* Effect.sleep('20 millis')
        // Revision 1 again, at the cursor the View is still at (P5).
        yield* world.deliverLate('p1', {
          state: { ownerId: 'ada', stock: 10, reserved: 0, note: 'stale', revision: 1 },
          cursor: 0,
        })
        yield* Effect.sleep('20 millis')
        yield* touch('again')
        yield* world.control.drain
        return yield* Fiber.join(watching)
      }),
    )
    expect(events.map(event => (event._tag === 'EntityPatched' ? event.values : null))).toEqual([
      { note: '', revision: 1 },
      { note: 'hello', revision: 2 },
      { note: 'again', revision: 3 },
    ])
  })

  it('answers a late read with what its own principal was let read, never another’s row', async () => {
    const late = await run(world =>
      Effect.gen(function* () {
        const client = yield* ShopApi.Client
        yield* client.Transfer('p1', { ownerId: 'grace' })
        yield* world.control.drain
        yield* Ref.set(world.actor, Option.some('grace'))
        const release = world.holdReply('ProductRow.snapshot')
        const graces = yield* Effect.forkChild(readP1)
        yield* Effect.sleep('20 millis')
        yield* client.Transfer('p1', { ownerId: 'ada' })
        yield* client.Touch('p1', { note: 'ada’s now' })
        yield* world.control.drain
        yield* Ref.set(world.actor, Option.some('ada'))
        yield* readP1
        yield* Ref.set(world.actor, Option.some('grace'))
        yield* release
        return yield* Fiber.join(graces)
      }),
    )
    expect(late.entities[0]?.values).toMatchObject({ ownerId: 'grace', note: '', revision: 2 })
  })

  it('reads a row validate hides as absent', async () => {
    const result = await run(world =>
      Effect.gen(function* () {
        yield* Ref.set(world.actor, Option.some('grace'))
        return yield* readP1
      }),
    )
    expect(result.entities).toEqual([])
    expect(result.principal).toBe('grace')
  })
})

describe('the law over the write', () => {
  it('finds no disagreement between the page and Domain', async () => {
    const Model = Schema.Struct({ remote: Remote.Model })
    const Data = Remote.make({
      model: ModelRef.fromOptic(Remote.Model, Optic.id<typeof Model.Type>().key('remote'), [
        'remote',
      ]),
      entities: [ProductEntity],
      mutations: [Reserve],
    })
    const report = await run(world =>
      Effect.gen(function* () {
        // The View catches up whenever it is behind, as a hosted one does.
        yield* Effect.forkChild(
          Effect.forever(Effect.andThen(world.control.drain, Effect.sleep('5 millis'))),
        )
        return yield* Law.check(Data, {
          model: { remote: Remote.initial },
          holds: [{ entity: ProductEntity, ids: ['p1'] }],
          lists: [],
          mutation: Reserve,
          input: { id: 'p1', quantity: 2, revision: 1 },
          now: 0,
        })
      }),
    )
    expect(report.disagreed).toEqual([])
    expect(report.agreed).toContain('Product:p1.reserved')
  })
})

describe('a binding', () => {
  it.each([
    { entity: StaffProduct, refused: /StaffProduct has a Read rule its Update rules do not imply/ },
    { entity: NotedProduct, refused: /NotedProduct\.note has a Read rule/ },
  ])(
    'refuses written where who may write $entity.name may not read all of it',
    ({ entity, refused }) => {
      const Reserving = Mutation.write(
        'Reserving',
        Write.update(
          Entity.input(
            entity,
            Schema.Struct({ id: Schema.String, quantity: Schema.Int, revision: Schema.Number }),
            { quantity: Entity.unmapped },
          ),
          { id: 'id', expect: 'revision', increment: { reserved: 'quantity' } },
        ),
      )
      const bind = () =>
        DomainRemote.command(Reserving, ShopApi, 'ReserveStock', {
          target: input => input.id,
          input: input => ({ quantity: input.quantity, revision: input.revision }),
          refusals: {
            Moved: () => DomainRemote.refuse({ _tag: 'Conflict' }),
            Invalid: () => DomainRemote.fail('invalid'),
            NotOwner: () => DomainRemote.forbid(),
            Missing: () => DomainRemote.fail('missing'),
          },
          written: reply => reply,
        })
      expect(bind).toThrow(refused)
    },
  )

  it('refuses a View whose state lacks an Entity field, naming it', () => {
    const Wider = Entity.define(
      'Product',
      Schema.Struct({ id: Schema.String, colour: Schema.String, revision: Schema.Number }),
    )
    expect(() => DomainRemote.view(Wider, ShopApi, 'ProductRow', { revision: 'revision' })).toThrow(
      /ProductRow's state has no field colour/,
    )
  })
})

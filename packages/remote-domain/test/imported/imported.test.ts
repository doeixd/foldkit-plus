// @vitest-environment node
/**
 * `Imported`: a command the author declared no `Write` for becomes a
 * mutation Remote sends, and `describe` says what the Api's bindings import,
 * over the adapter's model (`test/adapter/fixture.ts`).
 */
import { Effect, Layer, Option, Ref, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Footprint, Order } from 'foldkit-entity'
import { Mutation, Query, Reach, reaches, Remote, RemoteClient } from 'foldkit-remote'
import { explain } from 'foldkit-remote/why'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { DomainRemote } from '../../src/index.js'
import { Imported } from '../../src/imported/index.js'
import { invalidOf, ProductEntity, Reserve, ShopApi, StaffProduct } from '../adapter/fixture.js'
import { world as makeWorld } from '../adapter/transport.js'

const declared = Footprint.declared({
  writes: [ProductEntity.fields.note],
  by: 'the Domain model',
})

/** `Touch` as a mutation that names what it writes, and `Transfer` as one that names nothing. */
const Touch = Imported.mutation(ShopApi, 'Touch', { entity: ProductEntity, footprint: declared })
const Transfer = Imported.mutation(ShopApi, 'Transfer', { entity: ProductEntity })

const Reads = DomainRemote.view(ProductEntity, ShopApi, 'ProductRow', { revision: 'revision' })
const Reserving = DomainRemote.command(Reserve, ShopApi, 'ReserveStock', {
  target: input => input.id,
  input: input => ({ quantity: input.quantity, revision: input.revision }),
  refusals: {
    Moved: () => DomainRemote.refuse({ _tag: 'Conflict' }),
    Invalid: rejection => DomainRemote.refuse(invalidOf(rejection)),
    NotOwner: () => DomainRemote.forbid('Only its owner reserves its stock'),
    Missing: () => DomainRemote.fail('No such product'),
  },
  written: reply => reply,
})
const Touching = DomainRemote.command(Touch, ShopApi, 'Touch', {
  entity: ProductEntity,
  target: input => input.target,
  input: input => input.input,
})
const Transferring = DomainRemote.command(Transfer, ShopApi, 'Transfer', {
  entity: ProductEntity,
  target: input => input.target,
  input: input => input.input,
})

describe('Imported.mutation', () => {
  it('takes the target and input of the command and answers its reply', () => {
    expect(Touch.name).toBe('Touch')
    const wire = Schema.encodeSync(Touch.Input)({ target: 'p1', input: { note: 'hi' } })
    expect(wire).toEqual({ target: 'p1', input: { note: 'hi' } })
    expect(Schema.decodeUnknownSync(Touch.Input)(wire)).toEqual({
      target: 'p1',
      input: { note: 'hi' },
    })
    expect(() => Schema.decodeUnknownSync(Touch.Input)({ target: 'p1', input: {} })).toThrow()
    expect(Schema.decodeUnknownSync(Touch.Output)({})).toEqual({})
  })

  it('carries no write, and names its footprint over the Entity it was given', () => {
    expect(Touch.write).toBeUndefined()
    expect(Touch.footprint).toEqual({ entity: ProductEntity.identity, footprint: declared })
    expect(Transfer.footprint?.footprint).toBe(Footprint.unknown)
  })

  it('refuses with nothing unless given a refusal', () => {
    expect(() => Schema.decodeUnknownSync(Touch.Refusal)({ _tag: 'Conflict' })).toThrow()
    const Refused = Imported.mutation(ShopApi, 'Touch', {
      entity: ProductEntity,
      refusal: Schema.Struct({ _tag: Schema.Literal('Conflict') }),
    })
    expect(Schema.decodeUnknownSync(Refused.Refusal)({ _tag: 'Conflict' })).toEqual({
      _tag: 'Conflict',
    })
  })

  it('throws, naming it, for a command the Api does not serve', () => {
    expect(() =>
      // @ts-expect-error `Vanish` is no command of ShopApi.
      Imported.mutation(ShopApi, 'Vanish', { entity: ProductEntity }),
    ).toThrow(/ShopApi serves no command named Vanish/)
  })

  it('throws where a footprint of another Entity is made, and is a type error beside this Entity', () => {
    expect(() =>
      Footprint.declared({
        reads: [ProductEntity.fields.note],
        writes: [StaffProduct.fields.note],
        by: 'test',
      }),
    ).toThrow(/a footprint is of one Entity/)
    const staff = Footprint.declared({ writes: [StaffProduct.fields.note], by: 'test' })
    expect(() =>
      Imported.mutation(ShopApi, 'Touch', {
        entity: ProductEntity,
        // @ts-expect-error StaffProduct's fields are not ProductEntity's.
        footprint: staff,
      }),
    ).toThrow(/footprint is of StaffProduct, but its Entity is Product/)
  })

  it('throws for a footprint naming a field the Entity lacks, though the name matches', () => {
    const Namesake = Entity.define(
      'Product',
      Schema.Struct({ id: Schema.String, colour: Schema.String }),
    )
    expect(() =>
      Imported.mutation(ShopApi, 'Touch', {
        entity: ProductEntity,
        footprint: Footprint.declared({ writes: [Namesake.fields.colour], by: 'test' }),
      }),
    ).toThrow(/names colour, which Product does not declare/)
  })

  it('is callable through the adapter, which lands the command and answers its reply', async () => {
    const world = makeWorld()
    const layer = DomainRemote.layer(ShopApi, {
      views: [Reads],
      commands: [Reserving, Touching],
      principal: Ref.get(world.actor),
      denied: () => 'Unauthenticated',
      confirmWithin: world.confirmWithin,
    }).pipe(Layer.provideMerge(world.clientLayer), Layer.provideMerge(world.hosted))
    const seen = await Effect.runPromise(
      Effect.gen(function* () {
        const domain = yield* ShopApi.Client
        yield* domain.Seed('p1', { ownerId: 'ada', stock: 10 })
        yield* world.control.drain
        const client = yield* RemoteClient
        const answer = yield* client.mutate({
          requestId: 'r1',
          operation: 'op1',
          mutation: 'Touch',
          input: { target: 'p1', input: { note: 'fragile' } },
          principal: 'ada',
        })
        yield* world.control.drain
        const row = yield* domain.ProductRow.snapshot('p1')
        return { answer, note: row.state?.note }
      }).pipe(Effect.scoped, Effect.provide(layer)),
    )
    expect(seen.answer.output).toEqual({})
    expect(seen.answer.principal).toBe('ada')
    expect(seen.note).toBe('fragile')
  })
})

const description = Imported.describe(ShopApi, {
  views: [Reads],
  commands: [Touching, Reserving, Transferring],
  fields: { ReserveStock: { Invalid: 'reserved' } },
})

describe('Imported.describe', () => {
  const operation = (id: string) => description.operations.find(each => each.id === id)!

  it('lists operations and reads sorted by their stable ids', () => {
    expect(description.api).toBe('ShopApi')
    expect(description.operations.map(each => each.id)).toEqual([
      'ShopApi/ReserveStock',
      'ShopApi/Touch',
      'ShopApi/Transfer',
    ])
    expect(description.reads).toEqual([
      {
        id: 'ShopApi/ProductRow',
        kind: 'View',
        entity: 'Product',
        fields: ['ownerId', 'stock', 'reserved', 'note', 'revision'],
        revision: 'revision',
      },
    ])
  })

  it('derives the footprint of a declared write, takes a declared one as given, and leaves the rest unknown', () => {
    expect(operation('ShopApi/ReserveStock').footprint).toEqual(
      Footprint.Derived({ reads: ['reserved', 'revision'], writes: ['reserved', 'revision'] }),
    )
    expect(operation('ShopApi/Touch').footprint).toBe(declared)
    expect(operation('ShopApi/Transfer').footprint).toBe(Footprint.unknown)
  })

  it('leaves a mutation declared with Mutation.make unknown, as no footprint is no word', () => {
    const Plain = Mutation.make('Touch', {
      Input: { target: Schema.String, input: Schema.Struct({ note: Schema.String }) },
      Output: {},
    })
    const Plainly = DomainRemote.command(Plain, ShopApi, 'Touch', {
      entity: ProductEntity,
      target: input => input.target,
      input: input => input.input,
    })
    const described = Imported.describe(ShopApi, { views: [], commands: [Plainly] })
    expect(described.operations[0]?.footprint).toBe(Footprint.unknown)
  })

  it('gives each operation its mutation and JSON Schemas of its input and reply', () => {
    const reserve = operation('ShopApi/ReserveStock')
    expect(reserve.mutation).toBe('ReserveStock')
    expect(reserve.input).toMatchObject({
      type: 'object',
      required: ['target', 'input'],
      properties: {
        target: { type: 'string' },
        input: { required: ['quantity', 'revision'] },
      },
    })
    expect(reserve.reply).toEqual(
      Option.some(expect.objectContaining({ required: ['reserved', 'revision'] })),
    )
    expect(operation('ShopApi/Touch').reply).toEqual(Option.none())
  })

  it('lists each Rejection with its schema and the field it shows beside', () => {
    const rejections = operation('ShopApi/ReserveStock').rejections
    expect(rejections.map(each => [each.tag, each.field])).toEqual([
      ['Invalid', Option.some('reserved')],
      ['NotOwner', Option.none()],
      ['Moved', Option.none()],
      ['Missing', Option.none()],
    ])
    expect(JSON.stringify(rejections[0]!.schema)).toContain('"rule"')
    expect(operation('ShopApi/Touch').rejections).toEqual([])
  })

  it('has no description for a command that gives none', () => {
    expect(operation('ShopApi/Touch').description).toEqual(Option.none())
  })

  it('throws for a binding of another Api', () => {
    const elsewhere = { ...Touching, api: { apiName: 'Elsewhere' } } as unknown as typeof Touching
    expect(() => Imported.describe(ShopApi, { views: [], commands: [elsewhere] })).toThrow(
      /Touch is bound to Elsewhere, not ShopApi/,
    )
  })

  it('throws for a field naming a command not given or a Rejection it does not declare', () => {
    expect(() =>
      Imported.describe(ShopApi, {
        views: [Reads],
        commands: [Touching],
        fields: { ReserveStock: {} },
      }),
    ).toThrow(/fields names ReserveStock, which no command given is/)
    expect(() =>
      Imported.describe(ShopApi, {
        views: [],
        commands: [Reserving],
        // @ts-expect-error `Gone` is no Rejection of ReserveStock.
        fields: { ReserveStock: { Gone: 'reserved' } },
      }),
    ).toThrow(/fields names Gone, which ReserveStock does not declare/)
  })
})

describe('Imported.show', () => {
  const text = Imported.show(description)

  it('writes a section per command and a line per View', () => {
    expect(text).toContain('# ShopApi')
    expect(text).toContain('### ShopApi/ReserveStock')
    expect(text).toContain('- ShopApi/ProductRow: serves `Product`')
  })

  it('says each kind of footprint in its own words', () => {
    expect(text).toContain(
      'Footprint: derived from its declared write. Reads `reserved`, `revision`; writes `reserved`, `revision`.',
    )
    expect(text).toContain(
      'Footprint: declared by the Domain model, of Product. Reads nothing; writes `note`.',
    )
    expect(text).toContain('Footprint: unknown. It may write any member of its Entity')
  })

  it('names the field a Rejection shows beside, and no other', () => {
    expect(text).toContain('- `Invalid`, shown beside `reserved`')
    expect(text).toContain('- `NotOwner`\n')
  })

  it('is the same text for the same Api', () => {
    expect(Imported.show(description)).toBe(text)
  })
})

describe('what an imported command touches, as Remote judges a list by it', () => {
  const NoteList = Query.define('NoteList', {}, () =>
    Query.from(ProductEntity).pipe(
      Query.where(Expr.eq(ProductEntity.fields.note, 'fragile')),
      Query.orderBy(Order.asc(ProductEntity.fields.id)),
    ),
  )
  const Model = Schema.Struct({ remote: Remote.Model })
  const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
  const reachedBy = (mutations: ReadonlyArray<typeof Touch | typeof Transfer>) => {
    const Data = Remote.make({
      model: App.model.remote,
      entities: [ProductEntity],
      queries: [NoteList],
      mutations,
    })
    const read = Data.query(
      NoteList,
      {},
      { select: Entity.select(ProductEntity, { id: true, note: true }), first: 10 },
    )
    return explain(Data, { remote: Remote.initial }, read).reachedBy
  }

  it('names a declared footprint whose writes a list reads, in why', () => {
    expect(reachedBy([Touch])).toEqual(['Touch'])
  })

  it('leaves out a declared footprint whose writes a list does not read', () => {
    const Moves = Imported.mutation(ShopApi, 'Transfer', {
      entity: ProductEntity,
      footprint: Footprint.declared({
        writes: [ProductEntity.fields.ownerId],
        by: 'the Domain model',
      }),
    })
    expect(reachedBy([Moves])).toEqual([])
  })

  it('takes the conservative path for an unknown footprint: neither reaching nor missing the list', () => {
    expect(reachedBy([Touch, Transfer])).toEqual(['Touch'])
    expect(reaches(Transfer, NoteList)).toEqual(Reach.Unknown({ why: 'Handler' }))
    expect(reaches(Touch, NoteList)).toEqual(Reach.Reads())
  })
})
